// vcp-linux-fsops — Stage 12 Linux filesystem-operations helper.
//
// A small, auditable, single-purpose native helper. It performs dirfd-bound
// Linux filesystem operations that Node.js cannot express safely:
//   - renameat2(RENAME_NOREPLACE) with EEXIST denial (no lstat+rename race)
//   - O_NOFOLLOW / AT_SYMLINK_NOFOLLOW pinned directory chains
//   - directory fsync with explicit unsupported-filesystem failure
//   - FS_IOC_SETFLAGS immutable-bit management for the legacy-writer fence
//
// Safety model:
//   * --root must be an absolute path without ".."; it is opened once with
//     O_RDONLY|O_DIRECTORY|O_NOFOLLOW and every operation is resolved
//     component-by-component beneath that pinned fd. A swapped parent or a
//     symlink anywhere in the chain aborts the operation (exit 2/3).
//     (O_PATH fds are deliberately NOT used: parent directories are
//     fsync()ed and listed, which O_PATH does not permit.)
//   * Relative names are restricted to [A-Za-z0-9._-] components, max 128
//     chars each, max 32 components. No absolute names, no "..", no empty.
//   * JSON goes to stdout (one line). Nothing is read from the network,
//     no shell is involved, no config files are consulted.
//   * write-file-sync reads the payload from stdin (cap 64 MiB).
//
// Exit codes:
//   0  success                    {"ok":true,...}
//   10 OS denied the operation    {"ok":false,"osDenied":true,"errno":"EEXIST"|"EPERM"|...}
//   11 cross-filesystem           {"ok":false,"crossFilesystem":true,"errno":"EXDEV"}
//   12 unsupported on this fs     {"ok":false,"unsupported":true,"errno":"EINVAL"|"ENOSYS"}
//   2  usage / validation error
//   3  unexpected OS error
//
// Build (build step only; never executed before the frozen test phase):
//   c++ -std=c++17 -Wall -Wextra -O2 -o vcp-linux-fsops vcp-linux-fsops.cpp
// Kernel/arch: requires Linux with renameat2 (3.15+); tested on x86_64.
// The syscall is issued via syscall(2) so old libc headers still work.
#ifndef __linux__
#error Native Linux only
#endif
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <dirent.h>
#include <fcntl.h>
#include <linux/fs.h>
#include <string>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/utsname.h>
#include <sys/vfs.h>
#include <unistd.h>
#include <vector>

#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1U << 0)
#endif
#ifndef RENAME_EXCHANGE
#define RENAME_EXCHANGE (1U << 1)
#endif
#ifndef SYS_renameat2
#if defined(__x86_64__)
#define SYS_renameat2 316
#elif defined(__aarch64__)
#define SYS_renameat2 382
#else
#error renameat2 syscall number unknown for this arch
#endif
#endif
#ifndef FS_IMMUTABLE_FL
#define FS_IMMUTABLE_FL 0x00000010
#endif

static void json_escape(std::string& out, const std::string& s) {
  for (char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if ((unsigned char)c < 0x20) {
          char b[8]; snprintf(b, sizeof b, "\\u%04x", c); out += b;
        } else out += c;
    }
  }
}
static std::string jstr(const std::string& s) {
  std::string o = "\""; json_escape(o, s); o += "\""; return o;
}
static void emit(const std::string& body) {
  std::string line = body + "\n";
  (void)write(STDOUT_FILENO, line.c_str(), line.size());
}
static const char* errname(int e) {
  switch (e) {
    case EEXIST: return "EEXIST"; case ENOENT: return "ENOENT";
    case EPERM: return "EPERM"; case EACCES: return "EACCES";
    case EXDEV: return "EXDEV"; case EINVAL: return "EINVAL";
    case ENOSYS: return "ENOSYS"; case ENOTDIR: return "ENOTDIR";
    case ELOOP: return "ELOOP"; case ENOTEMPTY: return "ENOTEMPTY";
    case EISDIR: return "EISDIR"; case EROFS: return "EROFS";
    case ENAMETOOLONG: return "ENAMETOOLONG"; case ENOSPC: return "ENOSPC";
    case EFBIG: return "EFBIG"; case EDQUOT: return "EDQUOT";
    case EMLINK: return "EMLINK"; case ETXTBSY: return "ETXTBSY";
    default: return "E_OS_ERROR";
  }
}
static int fail_os(const std::string& op, int e) {
  // Classify the errno into the documented exit-code contract.
  std::string body = "{\"ok\":false,\"op\":" + jstr(op) +
      ",\"errno\":" + jstr(errname(e)) + ",\"errnoNum\":" +
      std::to_string(e);
  if (e == EEXIST || e == EPERM || e == EACCES || e == EROFS) {
    emit(body + ",\"osDenied\":true}");
    return 10;
  }
  if (e == EXDEV) { emit(body + ",\"crossFilesystem\":true}"); return 11; }
  if (e == EINVAL || e == ENOSYS) {
    emit(body + ",\"unsupported\":true}");
    return 12;
  }
  emit(body + "}");
  return 3;
}
static int fail_usage(const std::string& op, const std::string& why) {
  emit("{\"ok\":false,\"op\":" + jstr(op) + ",\"usageError\":" +
       jstr(why) + "}");
  return 2;
}

static bool valid_component(const std::string& c) {
  if (c.empty() || c.size() > 128 || c == "." || c == "..") return false;
  if ((int)c.size() > 128) return false;
  for (char ch : c) {
    bool ok = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ||
              (ch >= '0' && ch <= '9') || ch == '.' || ch == '_' ||
              ch == '-';
    if (!ok) return false;
  }
  return true;
}
static std::vector<std::string> split_rel(const std::string& rel) {
  std::vector<std::string> parts;
  std::string cur;
  for (char ch : rel) {
    if (ch == '/') { parts.push_back(cur); cur.clear(); }
    else cur += ch;
  }
  parts.push_back(cur);
  return parts;
}
// Open --root pinned: O_RDONLY|O_DIRECTORY|O_NOFOLLOW, must be a directory.
// A real (non-O_PATH) directory fd is required: parents are fsync()ed and
// listed through these fds, and fsync/fdopendir do not work on O_PATH fds.
// The open file description pins the inode for the operation's lifetime.
static int open_pinned_root(const std::string& root) {
  if (root.empty() || root[0] != '/' || root.find("..") != std::string::npos)
    return -100;
  int fd = open(root.c_str(),
                O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) return -101;
  struct stat st;
  if (fstat(fd, &st) != 0 || !S_ISDIR(st.st_mode)) {
    close(fd); return -102;
  }
  return fd;
}
// Resolve rel to (parent dirfd, final name), pinning every intermediate
// component with O_PATH|O_DIRECTORY|O_NOFOLLOW. rel=="." addresses root.
struct Resolved { int dirfd; std::string name; bool self; int err; };
static Resolved resolve_parent(int rootfd, const std::string& rel,
                               std::string& why) {
  Resolved r{-1, "", false, 0};
  if (rel == ".") { r.dirfd = rootfd; r.self = true; return r; }
  auto parts = split_rel(rel);
  if (parts.size() > 32) { why = "path too deep"; return r; }
  for (auto& p : parts) {
    if (!valid_component(p)) { why = "invalid path component"; return r; }
  }
  int cur = rootfd;
  bool owned = false;
  for (size_t i = 0; i + 1 < parts.size(); i++) {
    // Real directory fds (not O_PATH): the final parent is fsync()ed.
    int nxt = openat(cur, parts[i].c_str(),
                     O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (nxt < 0) { why = "intermediate open failed"; r.err = errno; goto bad; }
    struct stat st;
    if (fstat(nxt, &st) != 0 || !S_ISDIR(st.st_mode)) {
      int fe = (errno != 0) ? errno : ENOTDIR;
      close(nxt); why = "intermediate not a directory";
      r.err = S_ISDIR(st.st_mode) ? fe : ENOTDIR; goto bad;
    }
    if (owned) close(cur);
    cur = nxt; owned = true;
  }
  r.dirfd = cur; r.name = parts.back();
  // Keep ownership simple: caller closes only if owned.
  if (!owned) r.dirfd = rootfd;
  else { /* owned fd stays open in r.dirfd; mark via self=false + owned */ }
  r.self = false;
  // Encode ownership: reuse dirfd and stash flag in name? Keep explicit:
  // we leak the "owned" bit; instead dup rootfd when not owned so the
  // caller can uniformly close. Simpler: always hand an owned fd.
  if (!owned) {
    int d = dup(rootfd);
    if (d < 0) { why = "dup failed"; r.err = errno; r.dirfd = -1; return r; }
    r.dirfd = d;
  }
  return r;
bad:
  if (owned) close(cur);
  r.dirfd = -1;
  return r;
}
static bool fsync_fd(int fd) { return fsync(fd) == 0; }

static int op_mkdir_sync(int rootfd, const std::string& rel,
                         const std::string& mode_s) {
  const std::string op = "mkdir-sync";
  unsigned mode = 0700;
  if (!mode_s.empty()) {
    char* end = nullptr;
    unsigned long v = strtoul(mode_s.c_str(), &end, 8);
    if (!end || *end || v > 07777) return fail_usage(op, "bad mode");
    mode = (unsigned)v;
  }
  std::string why;
  Resolved t = resolve_parent(rootfd, rel, why);
  if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
  int rc = mkdirat(t.dirfd, t.name.c_str(), (mode_t)mode);
  int e = errno;
  if (rc != 0) { close(t.dirfd); return fail_os(op, e); }
  // mkdirat(...,mode) is still affected by the process umask. Pin the
  // EXCLUSIVELY created directory and set its requested permissions on
  // that descriptor before syncing its inode and parent namespace.
  int child = openat(t.dirfd,t.name.c_str(),
                     O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (child < 0) {
    e = errno; close(t.dirfd); return fail_os(op,e);
  }
  if (fchmod(child,(mode_t)mode)!=0) {
    e = errno; close(child); close(t.dirfd); return fail_os(op,e);
  }
  bool childSynced = fsync_fd(child);
  close(child);
  bool parentSynced = childSynced && fsync_fd(t.dirfd);
  close(t.dirfd);
  if (!childSynced || !parentSynced) return fail_os(op, errno ? errno : EIO);
  emit("{\"ok\":true,\"op\":" + jstr(op) + ",\"path\":" + jstr(rel) +
       ",\"directorySynced\":true}");
  return 0;
}

static int op_write_file_sync(int rootfd, const std::string& rel,
                              const std::string& mode_s) {
  const std::string op = "write-file-sync";
  unsigned mode = 0600;
  if (!mode_s.empty()) {
    char* end = nullptr;
    unsigned long v = strtoul(mode_s.c_str(), &end, 8);
    if (!end || *end || v > 07777) return fail_usage(op, "bad mode");
    mode = (unsigned)v;
  }
  std::string why;
  Resolved t = resolve_parent(rootfd, rel, why);
  if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
  int fd = openat(t.dirfd, t.name.c_str(),
                  O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
                  (mode_t)mode);
  int e = errno;
  if (fd < 0) { close(t.dirfd); return fail_os(op, e); }
  // Read payload from stdin, cap 64 MiB.
  std::string payload;
  payload.reserve(1 << 20);
  char buf[65536];
  ssize_t n;
  size_t total = 0;
  const size_t CAP = 64u * 1024u * 1024u;
  while ((n = read(STDIN_FILENO, buf, sizeof buf)) > 0) {
    total += (size_t)n;
    if (total > CAP) {
      close(fd); close(t.dirfd);
      return fail_usage(op, "payload exceeds 64MiB");
    }
    payload.append(buf, (size_t)n);
  }
  if (n < 0) {
    e = errno; close(fd); close(t.dirfd); return fail_os(op, e);
  }
  size_t off = 0;
  while (off < payload.size()) {
    ssize_t w = write(fd, payload.data() + off, payload.size() - off);
    if (w < 0) {
      e = errno; close(fd); close(t.dirfd); return fail_os(op, e);
    }
    off += (size_t)w;
  }
  // O_CREAT's mode is umask-filtered; persist the exact requested mode
  // on the already-pinned brand-new file before fsync and atomic rename.
  if (fchmod(fd,(mode_t)mode)!=0) {
    e=errno; close(fd); close(t.dirfd); return fail_os(op,e);
  }
  struct stat st{};
  bool ok = fstat(fd, &st) == 0 && S_ISREG(st.st_mode) &&
            (st.st_mode & 07777) == (mode_t)mode;
  bool data_synced = ok && fsync_fd(fd);
  close(fd);
  bool parentSynced = data_synced && fsync_fd(t.dirfd);
  long dev = (long)st.st_dev, ino = (long)st.st_ino;
  close(t.dirfd);
  if (!ok) return fail_os(op, EIO);
  emit("{\"ok\":true,\"op\":" + jstr(op) + ",\"path\":" + jstr(rel) +
       ",\"bytes\":" + std::to_string(payload.size()) +
       ",\"dataSynced\":" + (data_synced ? "true" : "false") +
       ",\"directorySynced\":" + (parentSynced ? "true" : "false") +
       ",\"dev\":" + std::to_string(dev) + ",\"ino\":" +
       std::to_string(ino) + "}");
  // Distinguish "written but not synced" from "not written": exit 0 with
  // explicit false flags keeps the caller honest about durability.
  return 0;
}

static int do_rename(int rootfd, const std::string& src,
                     const std::string& dst, bool noreplace,
                     bool exchange = false) {
  const std::string op = exchange ? "rename-exchange" :
    noreplace ? "rename-noreplace" : "rename-replace";
  std::string why;
  Resolved a = resolve_parent(rootfd, src, why);
  if (a.dirfd < 0) return a.err ? fail_os(op, a.err) : fail_usage(op, why);
  Resolved b = resolve_parent(rootfd, dst, why);
  if (b.dirfd < 0) { int be = b.err; close(a.dirfd);
    return be ? fail_os(op, be) : fail_usage(op, why); }
  if (a.self || b.self) {
    close(a.dirfd); close(b.dirfd);
    return fail_usage(op, "cannot rename the root itself");
  }
  long r;
  if (exchange) {
    // Stage13 existing-user-document swap: the displaced inode is retained
    // at the exact staged name, not overwritten or unlinked. No emulation.
    r = syscall(SYS_renameat2, a.dirfd, a.name.c_str(), b.dirfd,
                b.name.c_str(), RENAME_EXCHANGE);
  } else if (noreplace) {
    r = syscall(SYS_renameat2, a.dirfd, a.name.c_str(), b.dirfd,
                b.name.c_str(), RENAME_NOREPLACE);
  } else {
    r = renameat(a.dirfd, a.name.c_str(), b.dirfd, b.name.c_str());
  }
  int e = errno;
  bool srcSynced = false, dstSynced = false;
  if (r == 0) {
    srcSynced = fsync_fd(a.dirfd);
    dstSynced = (b.dirfd == a.dirfd) ? srcSynced : fsync_fd(b.dirfd);
  }
  close(a.dirfd); close(b.dirfd);
  if (r != 0) return fail_os(op, e);
  emit("{\"ok\":true,\"op\":" + jstr(op) + ",\"src\":" + jstr(src) +
       ",\"dst\":" + jstr(dst) + ",\"srcParentSynced\":" +
       (srcSynced ? "true" : "false") + ",\"dstParentSynced\":" +
       (dstSynced ? "true" : "false") + "}");
  return 0;
}

static int op_unlink_sync(int rootfd, const std::string& rel, bool isdir) {
  const std::string op = isdir ? "rmdir-sync" : "unlink-sync";
  std::string why;
  Resolved t = resolve_parent(rootfd, rel, why);
  if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
  if (t.self) { close(t.dirfd); return fail_usage(op, "cannot remove root"); }
  int rc = unlinkat(t.dirfd, t.name.c_str(),
                    isdir ? AT_REMOVEDIR : 0);
  int e = errno;
  bool synced = false;
  if (rc == 0) synced = fsync_fd(t.dirfd);
  close(t.dirfd);
  if (rc != 0) return fail_os(op, e);
  if (!synced) return fail_os(op, errno ? errno : EIO);
  emit("{\"ok\":true,\"op\":" + jstr(op) + ",\"path\":" + jstr(rel) +
       ",\"directorySynced\":true}");
  return 0;
}

static int op_fsync_dir(int rootfd, const std::string& rel) {
  const std::string op = "fsync-dir";
  int fd;
  if (rel == ".") {
    fd = dup(rootfd);
    if (fd < 0) return fail_os(op, errno);
  } else {
    std::string why;
    Resolved t = resolve_parent(rootfd, rel, why);
    if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
    if (t.self) { close(t.dirfd); return fail_usage(op, "bad path"); }
    fd = openat(t.dirfd, t.name.c_str(),
                O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    int e = errno;
    close(t.dirfd);
    if (fd < 0) return fail_os(op, e);
    struct stat st;
    if (fstat(fd, &st) != 0 || !S_ISDIR(st.st_mode)) {
      close(fd); return fail_os(op, ENOTDIR);
    }
  }
  int rc = fsync(fd);
  int e = errno;
  close(fd);
  if (rc != 0) return fail_os(op, e);
  emit("{\"ok\":true,\"op\":" + jstr(op) + ",\"path\":" + jstr(rel) +
       ",\"directorySynced\":true}");
  return 0;
}

static int op_stat_id(int rootfd, const std::string& rel) {
  const std::string op = "stat-id";
  std::string why;
  Resolved t = resolve_parent(rootfd, rel, why);
  if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
  struct stat st;
  int rc;
  if (t.self) rc = fstat(rootfd, &st);
  else rc = fstatat(t.dirfd, t.name.c_str(), &st, AT_SYMLINK_NOFOLLOW);
  int e = errno;
  close(t.dirfd);
  if (rc != 0) return fail_os(op, e);
  const char* type = S_ISREG(st.st_mode) ? "file"
      : S_ISDIR(st.st_mode) ? "dir" : S_ISLNK(st.st_mode) ? "symlink" : "other";
  char body[1024];
  // mode is emitted as an OCTAL STRING (JSON has no octal literals);
  // consumers parse it with base 8.
  snprintf(body, sizeof body,
           "{\"ok\":true,\"op\":\"stat-id\",\"path\":%s,"
           "\"type\":%s,\"dev\":%ld,\"ino\":%ld,\"devExact\":%s,\"inoExact\":%s,\"modeOct\":%s,"
           "\"uid\":%u,\"gid\":%u,\"size\":%lld}",
           jstr(rel).c_str(), jstr(type).c_str(), (long)st.st_dev,
           (long)st.st_ino,
           jstr(std::to_string((unsigned long long)st.st_dev)).c_str(),
           jstr(std::to_string((unsigned long long)st.st_ino)).c_str(),
           jstr([&]{
             char m[16]; snprintf(m, sizeof m, "%o",
                                 (unsigned)(st.st_mode & 07777));
             return std::string(m); }()).c_str(),
           (unsigned)st.st_uid, (unsigned)st.st_gid,
           (long long)st.st_size);
  emit(body);
  return 0;
}

static int op_flags(int rootfd, const std::string& rel, bool set,
                    bool immutable) {
  const std::string op = set ? (immutable ? "set-immutable" : "clear-immutable")
                             : "get-flags";
  std::string why;
  Resolved t = resolve_parent(rootfd, rel, why);
  if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
  if (t.self) { close(t.dirfd); return fail_usage(op, "bad path"); }
  int fd = openat(t.dirfd, t.name.c_str(),
                  O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  int e = errno;
  close(t.dirfd);
  if (fd < 0) return fail_os(op, e);
  int flags = 0;
  if (ioctl(fd, FS_IOC_GETFLAGS, &flags) != 0) {
    e = errno; close(fd); return fail_os(op, e);
  }
  if (set) {
    int want = immutable ? (flags | FS_IMMUTABLE_FL)
                         : (flags & ~FS_IMMUTABLE_FL);
    if (want != flags && ioctl(fd, FS_IOC_SETFLAGS, &want) != 0) {
      e = errno; close(fd); return fail_os(op, e);
    }
    flags = want;
  }
  close(fd);
  char body[512];
  snprintf(body, sizeof body,
           "{\"ok\":true,\"op\":%s,\"path\":%s,\"flags\":%d,"
           "\"immutable\":%s}",
           jstr(op).c_str(), jstr(rel).c_str(), flags,
           (flags & FS_IMMUTABLE_FL) ? "true" : "false");
  emit(body);
  return 0;
}

static int op_list_names(int rootfd, const std::string& rel) {
  const std::string op = "list-names";
  int dfd;
  if (rel == ".") {
    dfd = dup(rootfd);
    if (dfd < 0) return fail_os(op, errno);
  } else {
    std::string why;
    Resolved t = resolve_parent(rootfd, rel, why);
    if (t.dirfd < 0) return t.err ? fail_os(op, t.err) : fail_usage(op, why);
    if (t.self) { close(t.dirfd); return fail_usage(op, "bad path"); }
    dfd = openat(t.dirfd, t.name.c_str(),
                 O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    int e = errno;
    close(t.dirfd);
    if (dfd < 0) return fail_os(op, e);
    struct stat st;
    if (fstat(dfd, &st) != 0 || !S_ISDIR(st.st_mode)) {
      close(dfd); return fail_os(op, ENOTDIR);
    }
  }
  DIR* d = fdopendir(dfd);
  if (!d) { int e = errno; close(dfd); return fail_os(op, e); }
  std::string names = "[";
  bool first = true;
  struct dirent* e;
  size_t count = 0;
  // Forensic inventory is bounded: a hostile tree with millions of
  // entries must yield an explicit refusal, never an unbounded allocation
  // or a truncated JSON success receipt.
  constexpr size_t MAX_NAMES = 4096;
  constexpr size_t MAX_ENCODED_NAMES = 1024 * 1024;
  while ((e = readdir(d))) {
    std::string n(e->d_name);
    if (n == "." || n == "..") continue;
    if (++count > MAX_NAMES || names.size() + n.size()*6 + 8 >
                               MAX_ENCODED_NAMES) {
      closedir(d);
      return fail_usage(op, "directory inventory limit");
    }
    if (!first) names += ",";
    first = false;
    names += jstr(n);
  }
  closedir(d);
  names += "]";
  emit("{\"ok\":true,\"op\":\"list-names\",\"path\":" + jstr(rel) +
       ",\"names\":" + names + "}");
  return 0;
}

static const char* fstype_name(long t) {
  // Common magic numbers (statfs f_type).
  if (t == 0x9123683EL) return "btrfs";
  if (t == 0xEF53L) return "ext4";
  if (t == 0x01021994L) return "tmpfs";
  if (t == 0x58465342L) return "xfs";
  if (t == 0x6969L) return "nfs";
  if (t == 0x5346544EL) return "ntfs";
  if (t == 0x2FC12FC1L) return "zfs";
  return "unknown";
}

static int op_probe(const std::string& dir) {
  const std::string op = "probe";
  if (dir.empty() || dir[0] != '/' || dir.find("..") != std::string::npos)
    return fail_usage(op, "bad probe dir");
  int dfd = open(dir.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (dfd < 0) return fail_os(op, errno);
  // Must be empty: the caller creates a fresh disposable directory.
  bool empty = true;
  {
    DIR* d = fdopendir(dup(dfd));
    if (!d) { close(dfd); return fail_os(op, errno); }
    struct dirent* e;
    while ((e = readdir(d))) {
      std::string n(e->d_name);
      if (n != "." && n != "..") { empty = false; break; }
    }
    closedir(d);
  }
  if (!empty) { close(dfd); return fail_usage(op, "probe dir not empty"); }
  bool nrFresh = false, nrDenied = false, dirSync = false;
  bool immSettable = false;
  std::string immErr = "";
  if (mkdirat(dfd, "pp-a", 0700) == 0 && mkdirat(dfd, "pp-b", 0700) == 0) {
    long r = syscall(SYS_renameat2, dfd, "pp-a", dfd, "pp-c", RENAME_NOREPLACE);
    nrFresh = (r == 0);
    errno = 0;
    r = syscall(SYS_renameat2, dfd, "pp-c", dfd, "pp-b", RENAME_NOREPLACE);
    nrDenied = (r == -1 && errno == EEXIST);
  }
  dirSync = (fsync(dfd) == 0);
  int efd = errno;
  {
    int f = openat(dfd, "pp-imm", O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
    if (f >= 0) {
      int fl = 0;
      if (ioctl(f, FS_IOC_GETFLAGS, &fl) == 0) {
        int want = fl | FS_IMMUTABLE_FL;
        if (ioctl(f, FS_IOC_SETFLAGS, &want) == 0) {
          immSettable = true;
          want &= ~FS_IMMUTABLE_FL;
          (void)ioctl(f, FS_IOC_SETFLAGS, &want);
        } else immErr = errname(errno);
      } else immErr = errname(errno);
      close(f);
      unlinkat(dfd, "pp-imm", 0);
    } else immErr = errname(errno);
  }
  // Cleanup our own names only.
  unlinkat(dfd, "pp-a", AT_REMOVEDIR);
  unlinkat(dfd, "pp-b", AT_REMOVEDIR);
  unlinkat(dfd, "pp-c", AT_REMOVEDIR);
  bool cleanupSync = (fsync(dfd) == 0);
  struct statfs sfs;
  std::string fstype = "unknown";
  if (statfs(dir.c_str(), &sfs) == 0) fstype = fstype_name((long)sfs.f_type);
  struct utsname un;
  std::string rel = "unknown", arch = "unknown";
  if (uname(&un) == 0) { rel = un.release; arch = un.machine; }
  close(dfd);
  std::string body =
      std::string("{\"ok\":true,\"op\":\"probe\",\"kernel\":") + jstr(rel) +
      ",\"arch\":" + jstr(arch) + ",\"filesystem\":" + jstr(fstype) +
      ",\"renameat2NoreplaceFresh\":" + (nrFresh ? "true" : "false") +
      ",\"renameat2NoreplaceDeniedOnCollision\":" +
      (nrDenied ? "true" : "false") + ",\"directoryFsyncOk\":" +
      (dirSync ? "true" : "false") + ",\"cleanupFsyncOk\":" +
      (cleanupSync ? "true" : "false") + ",\"immutableSettable\":" +
      (immSettable ? "true" : "false") + ",\"immutableErrno\":" +
      jstr(immErr) + ",\"dirFsyncErrno\":" + jstr(errname(efd)) + "}";
  emit(body);
  return 0;
}

static void usage() {
  const char* m =
      "usage: vcp-linux-fsops --root ABS --op OP [args]\n"
      "   or: vcp-linux-fsops --probe-dir ABS --op probe\n"
      "ops: mkdir-sync <rel> [mode] | write-file-sync <rel> [mode] < stdin\n"
      "     rename-noreplace <src> <dst> | rename-replace <src> <dst> |\n"
      "     rename-exchange <src> <dst>\n"
      "     unlink-sync <rel> | rmdir-sync <rel> | fsync-dir <rel> |\n"
      "     list-names <rel> | stat-id <rel> | get-flags <rel> |\n"
      "     set-immutable <rel> | clear-immutable <rel>\n";
  (void)write(STDERR_FILENO, m, strlen(m));
}

int main(int argc, char** argv) {
  std::string root, probeDir, op;
  std::vector<std::string> args;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    if (a == "--root" && i + 1 < argc) root = argv[++i];
    else if (a == "--probe-dir" && i + 1 < argc) probeDir = argv[++i];
    else if (a == "--op" && i + 1 < argc) op = argv[++i];
    else if (a == "--help" || a == "-h") { usage(); return 2; }
    else args.push_back(a);
  }
  if (op == "probe") {
    if (probeDir.empty() || !root.empty()) { usage(); return 2; }
    return op_probe(probeDir);
  }
  if (root.empty() || op.empty()) { usage(); return 2; }
  int rootfd = open_pinned_root(root);
  if (rootfd < 0) {
    return fail_usage(op.empty() ? "init" : op,
                      rootfd == -100 ? "bad root path"
                                     : "cannot open root directory");
  }
  int rc = 2;
  if (op == "mkdir-sync" && args.size() >= 1 && args.size() <= 2)
    rc = op_mkdir_sync(rootfd, args[0], args.size() > 1 ? args[1] : "");
  else if (op == "write-file-sync" && args.size() >= 1 && args.size() <= 2)
    rc = op_write_file_sync(rootfd, args[0], args.size() > 1 ? args[1] : "");
  else if (op == "rename-noreplace" && args.size() == 2)
    rc = do_rename(rootfd, args[0], args[1], true);
  else if (op == "rename-replace" && args.size() == 2)
    rc = do_rename(rootfd, args[0], args[1], false);
  else if (op == "rename-exchange" && args.size() == 2)
    rc = do_rename(rootfd, args[0], args[1], false, true);
  else if (op == "unlink-sync" && args.size() == 1)
    rc = op_unlink_sync(rootfd, args[0], false);
  else if (op == "rmdir-sync" && args.size() == 1)
    rc = op_unlink_sync(rootfd, args[0], true);
  else if (op == "fsync-dir" && args.size() == 1)
    rc = op_fsync_dir(rootfd, args[0]);
  else if (op == "list-names" && args.size() == 1)
    rc = op_list_names(rootfd, args[0]);
  else if (op == "stat-id" && args.size() == 1)
    rc = op_stat_id(rootfd, args[0]);
  else if (op == "get-flags" && args.size() == 1)
    rc = op_flags(rootfd, args[0], false, false);
  else if (op == "set-immutable" && args.size() == 1)
    rc = op_flags(rootfd, args[0], true, true);
  else if (op == "clear-immutable" && args.size() == 1)
    rc = op_flags(rootfd, args[0], true, false);
  else {
    usage();
    emit("{\"ok\":false,\"op\":" + jstr(op.empty() ? "init" : op) +
         ",\"usageError\":\"unknown op or wrong arity\"}");
    rc = 2;
  }
  close(rootfd);
  return rc;
}
