// Stage12/13 Windows NTFS namespace operations — disposable-root candidate.
// NOT a managed lifecycle writer. No durable-transaction or D-01 approval.
// Build (native Windows, VS developer prompt):
//   npm run build:native-windows
// Invoke only on an EMPTY scratch directory with the exact marker created
// manually: "VCP_STAGE12_DISPOSABLE_TEST_ROOT_ONLY\n".
//   vcp-windows-fsops.exe --scratch-root %TMP%\vcp-win-native-scratch-ABC123 --op capabilities
//   ... --op write-exclusive vcp-stage12-file.bin < payload
//   ... --op rename-no-replace vcp-stage12-file.bin vcp-stage12-moved.bin
//   ... --op unlink vcp-stage12-moved.bin
//
// Every path operation uses a flat, reserved vcp-stage12-* name under a
// direct vcp-win-native-scratch-* child of OS TEMP. The binary refuses
// extra/linked contents, non-NTFS volumes, UNC, linked ancestors,
// any invocation outside an operator-marked disposable directory.
// This is research source; do not route selected-root writers to it.
// There is no production trust grant merely because an operator can create
// a marker in a folder. Full ACL/MAC isolation and durable namespace
// semantics must be separately approved before any user-root integration.
//
// IMPORTANT: FileRenameInfo uses a *scratch-restricted* absolute leaf path
// because independent Windows 11 probes rejected RootDirectory+relative name.
// This is NOT a descriptor-relative production rename. All ancestor handles
// remain pinned without FILE_SHARE_DELETE until verified completion.
// Disposition uses DELETE-capable handles; other operations remain name-based.
// None of these calls prove namespace power-loss durability.
// Directory disposition is still a candidate to be checked on real NTFS.
// IMPORTANT: Win32 completion, FlushFileBuffers(file), and even a successful
// directory FlushFileBuffers do not prove journal/power-loss durability.
// A failed directory flush is an explicit nonzero exit AFTER any completed
// operation and must retain state for forensic inspection. Never claim that
// a process exit 0 is a certified crash-consistent transaction.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstring>
#include <cwchar>
#include <sstream>
#include <iomanip>
#include <cstddef>
#include <iostream>
#include <utility>
#include <string>
#include <vector>

namespace {
constexpr DWORD kMaxPayload = 1024U * 1024U;
const wchar_t* kMarker = L"VCP-STAGE12-DISPOSABLE-ONLY.marker";
const char* kMarkerBytes = "VCP_STAGE12_DISPOSABLE_TEST_ROOT_ONLY\n";
struct EntryObservation {
  bool known = false;
  bool exists = false;
  const char* type = "ABSENT";
  std::string identity;
  std::string sizeBytes = "0";
};

struct Handle {
  HANDLE h = INVALID_HANDLE_VALUE;
  explicit Handle(HANDLE value = INVALID_HANDLE_VALUE) : h(value) {}
  ~Handle() { if (h != INVALID_HANDLE_VALUE) CloseHandle(h); }
  Handle(const Handle&) = delete;
  Handle& operator=(const Handle&) = delete;
  Handle(Handle&& other) noexcept : h(other.h) {
    other.h = INVALID_HANDLE_VALUE;
  }
  Handle& operator=(Handle&& other) noexcept {
    if (this != &other) {
      if (h != INVALID_HANDLE_VALUE) CloseHandle(h);
      h = other.h;
      other.h = INVALID_HANDLE_VALUE;
    }
    return *this;
  }
  bool valid() const { return h != INVALID_HANDLE_VALUE; }
};

std::wstring join(const std::wstring& dir, const std::wstring& name) {
  return dir + L"\\" + name;
}
bool allowedName(const std::wstring& name) {
  const std::wstring prefix = L"vcp-stage12-";
  if (name.size() <= prefix.size() || name.size() > 95 ||
      name.compare(0, prefix.size(), prefix) != 0 ||
      name.back() == L'.' || name.back() == L' ') return false;
  for (const wchar_t c : name) {
    if (!((c >= L'a' && c <= L'z') ||
          (c >= L'0' && c <= L'9') || c == L'-' || c == L'_' ||
          c == L'.')) return false;
  }
  return true;
}
bool scratchRootUnderTemp(const std::wstring& root) {
  wchar_t buf[MAX_PATH] = {};
  const DWORD n = GetTempPathW(MAX_PATH, buf);
  if (n == 0 || n >= MAX_PATH) return false;
  std::wstring tmp(buf);
  // GetTempPathW is environment-selected, NOT a privileged trust boundary.
  // This is a containment restriction to reduce accidental misuse.
  if (tmp.empty() || tmp.back() != L'\\') return false;
  wchar_t canonical[MAX_PATH] = {};
  const DWORD m = GetFullPathNameW(tmp.c_str(), MAX_PATH, canonical, nullptr);
  if (m == 0 || m >= MAX_PATH) return false;
  tmp.assign(canonical);
  if (tmp.empty() || tmp.back() != L'\\') tmp += L'\\';
  const std::wstring prefix = tmp + L"vcp-win-native-scratch-";
  if (root.size() < prefix.size() + 6 ||
      _wcsnicmp(root.c_str(), prefix.c_str(), prefix.size()) != 0)
    return false;
  const std::wstring suffix = root.substr(prefix.size());
  // Only a direct, mkdtemp-style child of TMP/TEMP is accepted.
  if (suffix.find_first_of(L"\\/:.") != std::wstring::npos) return false;
  for (const wchar_t c : suffix) {
    if (!((c >= L'A' && c <= L'Z') ||
          (c >= L'a' && c <= L'z') ||
          (c >= L'0' && c <= L'9') ||
          c == L'-' || c == L'_')) return false;
  }
  return true;
}
// Keep no-delete handles to every ancestor and the selected scratch root
// open throughout each operation. This narrows rename/swap windows under
// NTFS sharing rules; it is NOT a descriptor-relative production writer.
bool pinAncestorsNoRename(const std::wstring& root,
                          std::vector<Handle>& pins) {
  for (size_t i = 3; i <= root.size(); ++i) {
    if (i == root.size() || root[i] == L'\\') {
      if (i == 3) continue;
      const std::wstring current = root.substr(0, i);
      pins.emplace_back(CreateFileW(current.c_str(), FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
      if (!pins.back().valid()) return false;
      BY_HANDLE_FILE_INFORMATION info = {};
      if (!GetFileInformationByHandle(pins.back().h, &info) ||
          !(info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
          (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT))
        return false;
    }
  }
  return true;
}
bool checkedRoot(const std::wstring& input, std::wstring& out) {
  if (input.find(L"..") != std::wstring::npos ||
      input.find(L"/") != std::wstring::npos || input.size() > 210 ||
      input.size() < 5 || input.find(L':') != 1 ||
      input[2] != L'\\') return false;
  wchar_t buf[MAX_PATH] = {};
  const DWORD count = GetFullPathNameW(input.c_str(), MAX_PATH, buf, nullptr);
  if (count == 0 || count >= MAX_PATH) return false;
  out.assign(buf);
  if (out.size() < 5 || out.size() > 210 ||
      out[1] != L':' || out[2] != L'\\' ||
      out.back() == L'\\') return false;
  // The complete path is only as safe as its ancestors. This check is a
  // development preflight, not a race-free production root capability.
  for (size_t i = 3; i <= out.size(); ++i) {
    if (i == out.size() || out[i] == L'\\') {
      if (i > 3) {
        const DWORD attrs = GetFileAttributesW(out.substr(0, i).c_str());
        if (attrs == INVALID_FILE_ATTRIBUTES ||
            !(attrs & FILE_ATTRIBUTE_DIRECTORY) ||
            (attrs & FILE_ATTRIBUTE_REPARSE_POINT)) return false;
      }
    }
  }
  return scratchRootUnderTemp(out);
}
bool rootIdentity(HANDLE root, BY_HANDLE_FILE_INFORMATION& info) {
  return GetFileInformationByHandle(root, &info) != 0 &&
         (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0 &&
         (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0;
}
bool sameIdentity(const BY_HANDLE_FILE_INFORMATION& a,
                  const BY_HANDLE_FILE_INFORMATION& b) {
  return a.dwVolumeSerialNumber == b.dwVolumeSerialNumber &&
         a.nFileIndexHigh == b.nFileIndexHigh &&
         a.nFileIndexLow == b.nFileIndexLow;
}
bool readMarker(const std::wstring& root) {
  Handle file(CreateFileW(join(root, kMarker).c_str(), GENERIC_READ,
      FILE_SHARE_READ, nullptr, OPEN_EXISTING,
      FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  if (!file.valid()) return false;
  BY_HANDLE_FILE_INFORMATION info = {};
  if (!GetFileInformationByHandle(file.h, &info) ||
      (info.dwFileAttributes &
       (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) ||
      info.nNumberOfLinks != 1) return false;
  char bytes[64] = {};
  DWORD size = 0;
  const DWORD expected = static_cast<DWORD>(std::strlen(kMarkerBytes));
  if (!ReadFile(file.h, bytes, sizeof(bytes), &size, nullptr)) return false;
  return size == expected && std::memcmp(bytes, kMarkerBytes, expected) == 0;
}
bool safeInventory(const std::wstring& root) {
  WIN32_FIND_DATAW entry = {};
  HANDLE h = FindFirstFileW(join(root, L"*").c_str(), &entry);
  if (h == INVALID_HANDLE_VALUE) return false;
  bool marker = false, valid = true;
  do {
    const std::wstring name(entry.cFileName);
    if (name == L"." || name == L"..") continue;
    if (name == kMarker) {
      marker = true;
    } else if (!allowedName(name) ||
               (entry.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) {
      valid = false;
      break;
    }
  } while (FindNextFileW(h, &entry));
  const DWORD enumerationError = valid ? GetLastError() : ERROR_INVALID_DATA;
  FindClose(h);
  // An interrupted FindNextFileW enumeration is never a clean inventory.
  return valid && enumerationError == ERROR_NO_MORE_FILES &&
         marker && readMarker(root);
}
bool ntfsVolume(const std::wstring& root) {
  wchar_t volume[MAX_PATH] = {}, fs[MAX_PATH] = {};
  return GetVolumePathNameW(root.c_str(), volume, MAX_PATH) != 0 &&
    GetVolumeInformationW(volume, nullptr, 0, nullptr, nullptr, nullptr,
                          fs, MAX_PATH) != 0 && _wcsicmp(fs, L"NTFS") == 0;
}
// Operate on the exact object opened, rather than lstat(path) followed
// by a second path lookup. Handles must be opened DELETE-capable for Win32
// FileRenameInfo/FileDispositionInfo; NOFOLLOW is required even for scratch.
bool normalOwnedOpen(HANDLE h, bool directory) {
  BY_HANDLE_FILE_INFORMATION info = {};
  if (!GetFileInformationByHandle(h, &info) ||
      (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
      info.nNumberOfLinks != 1) return false;
  return ((info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) ==
      directory;
}
bool renameOwnedFileNoReplace(HANDLE source,
                              const std::wstring& verifiedScratchRoot,
                              const std::wstring& targetLeaf,
                              DWORD& lastError) {
  // IMPORTANT, SCRATCH-ONLY COMPATIBILITY WORKAROUND:
  // Independent Windows 11 build 26200 / NTFS probes show that
  // SetFileInformationByHandle(FileRenameInfo) with RootDirectory != NULL
  // and a relative FileName fails with ERROR_INVALID_PARAMETER (87);
  // the Win32 API instead accepts RootDirectory=NULL + an absolute name.
  //
  // Absolute path use is ONLY permitted here because this executable
  // already refuses every target outside a marked, direct OS-TEMP scratch
  // root, validates a single reserved leaf component, opens every ancestor
  // including the scratch root WITHOUT FILE_SHARE_DELETE for the duration
  // of the operation, and checks the root and file identities afterwards.
  // Such a name-based workaround is NOT approved for selected-project
  // lifecycle writes. A separate production descriptor-bound design and
  // D-01 approval would be needed before wiring any managed operations.
  // Defense in depth beyond wmain's allowlist: the fallback must NEVER
  // accept a separator, drive prefix, "..", reparse route or arbitrary name.
  if(!allowedName(targetLeaf) || !scratchRootUnderTemp(verifiedScratchRoot)){
    lastError=ERROR_INVALID_NAME;
    return false;
  }
  const std::wstring target=join(verifiedScratchRoot,targetLeaf);
  if(target.size()>=MAX_PATH) {
    lastError=ERROR_FILENAME_EXCED_RANGE;
    return false;
  }
  // ReplaceIfExists=FALSE must remain enforced by the kernel. Never
  // lstat+remove a destination or retry with REPLACE_EXISTING.
  const size_t bytes=offsetof(FILE_RENAME_INFO, FileName) +
      (target.size()+1) * sizeof(wchar_t);
  std::vector<std::max_align_t> storage(
      (bytes+sizeof(std::max_align_t)-1)/sizeof(std::max_align_t));
  auto* info=reinterpret_cast<FILE_RENAME_INFO*>(storage.data());
  info->ReplaceIfExists=FALSE;
  info->RootDirectory=nullptr;
  info->FileNameLength=static_cast<DWORD>(target.size()*sizeof(wchar_t));
  std::memcpy(info->FileName,target.c_str(),
              (target.size()+1)*sizeof(wchar_t));
  const BOOL moved=SetFileInformationByHandle(source,FileRenameInfo,info,
                                              static_cast<DWORD>(bytes));
  if(!moved)lastError=GetLastError();
  return moved!=0;
}
bool verifyRenamedFileIdentity(const std::wstring& root,
                               const std::wstring& oldName,
                               const std::wstring& newName,
                               HANDLE source) {
  // An OS rename returning success alone does not tell us that some
  // unexpected pathname replacement or alias was not observed later.
  // Verify the new name still denotes the same held file identity.
  Handle target(CreateFileW(join(root,newName).c_str(),
      FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
      nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
  BY_HANDLE_FILE_INFORMATION fromInfo = {}, toInfo = {};
  if(!target.valid() || !normalOwnedOpen(target.h,false) ||
     !GetFileInformationByHandle(source,&fromInfo) ||
     !GetFileInformationByHandle(target.h,&toInfo) ||
     !sameIdentity(fromInfo,toInfo)) return false;
  // Any surviving old-name entry is unsafe or a competing writer.
  const DWORD attrs=GetFileAttributesW(join(root,oldName).c_str());
  return attrs==INVALID_FILE_ATTRIBUTES &&
      GetLastError()==ERROR_FILE_NOT_FOUND;
}
bool verifyRemovedName(const std::wstring& root,
                       const std::wstring& name) {
  const DWORD attrs=GetFileAttributesW(join(root,name).c_str());
  return attrs==INVALID_FILE_ATTRIBUTES &&
      GetLastError()==ERROR_FILE_NOT_FOUND;
}
bool disposeOwnedHandle(HANDLE object,DWORD& lastError) {
  FILE_DISPOSITION_INFO disposal = {};
  disposal.DeleteFile=TRUE;
  const BOOL disposed=SetFileInformationByHandle(
      object,FileDispositionInfo,&disposal,sizeof(disposal));
  if(!disposed)lastError=GetLastError();
  // The actual namespace disappearance is pending until the handle closes.
  return disposed!=0;
}
bool inspectScratchEntry(const std::wstring& root,
                         const std::wstring& name,
                         EntryObservation& result,DWORD& osError) {
  Handle object(CreateFileW(join(root,name).c_str(),FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,
      FILE_FLAG_OPEN_REPARSE_POINT|FILE_FLAG_BACKUP_SEMANTICS,nullptr));
  if(!object.valid()) {
    osError=GetLastError();
    if(osError==ERROR_FILE_NOT_FOUND) {
      result.known=true;
      result.exists=false;
      result.type="ABSENT";
      osError=0;
      return true;
    }
    return false; // ERROR_ACCESS_DENIED is not proof the name is absent.
  }
  BY_HANDLE_FILE_INFORMATION info = {};
  if(!GetFileInformationByHandle(object.h,&info)) {
    osError=GetLastError();
    return false;
  }
  // Even a read-only probe must not report a reparse-point or an alias
  // as a trusted owned file. Leave the state for manual investigation.
  if((info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)!=0 ||
     info.nNumberOfLinks!=1) {
    osError=ERROR_INVALID_DATA;
    return false;
  }
  result.known=true;
  result.exists=true;
  result.type=(info.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0
      ?"DIRECTORY":"REGULAR";
  std::ostringstream id;
  id<<std::hex<<std::setfill('0')
    <<std::setw(8)<<info.dwVolumeSerialNumber
    <<std::setw(8)<<info.nFileIndexHigh
    <<std::setw(8)<<info.nFileIndexLow;
  result.identity=id.str();
  const unsigned long long bytes=
    (static_cast<unsigned long long>(info.nFileSizeHigh)<<32) |
      info.nFileSizeLow;
  result.sizeBytes=std::to_string(bytes);
  return true;
}
bool readBoundedStdin(std::vector<char>& payload) {
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  if (input == INVALID_HANDLE_VALUE || input == nullptr) return false;
  char block[8192];
  while (true) {
    DWORD count = 0;
    if (!ReadFile(input, block, sizeof(block), &count, nullptr)) {
      const DWORD error = GetLastError();
      // With Node's anonymous stdin pipe, a closed write-end reports
      // ERROR_BROKEN_PIPE rather than a successful zero-byte read.
      // ERROR_HANDLE_EOF is the equivalent EOF signal for some file handles.
      // All other errors remain fatal before CREATE_NEW is attempted.
      if (error == ERROR_BROKEN_PIPE || error == ERROR_HANDLE_EOF)
        return true;
      return false;
    }
    if (count == 0) return true;
    if (payload.size() + count > kMaxPayload) return false;
    payload.insert(payload.end(), block, block + count);
  }
}
bool writeExclusive(const std::wstring& full,
                    const std::vector<char>& bytes, DWORD& lastError,
                    bool& mayHaveMutated) {
  Handle file(CreateFileW(full.c_str(), GENERIC_WRITE, 0, nullptr,
      CREATE_NEW, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH |
      FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  if (!file.valid()) { lastError = GetLastError(); return false; }
  // CREATE_NEW has already changed the namespace. Later WriteFile or
  // FlushFileBuffers failure MUST NOT be reported as a no-mutation failure.
  mayHaveMutated = true;
  // Avoid passing a potentially null vector::data() for zero-length
  // payloads. An empty new file still receives FlushFileBuffers below.
  if (!bytes.empty()) {
    DWORD wrote = 0;
    const BOOL ok = WriteFile(file.h, bytes.data(),
        static_cast<DWORD>(bytes.size()), &wrote, nullptr);
    if (!ok || wrote != static_cast<DWORD>(bytes.size())) {
      lastError = ok ? ERROR_WRITE_FAULT : GetLastError();
      return false; // partial file is deliberately retained
    }
  }
  if (!FlushFileBuffers(file.h)) { lastError = GetLastError(); return false; }
  return true;
}
bool flushRoot(const std::wstring& root, DWORD& lastError) {
  Handle dir(CreateFileW(root.c_str(), FILE_WRITE_DATA | FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      nullptr, OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  if (!dir.valid()) { lastError = GetLastError(); return false; }
  BY_HANDLE_FILE_INFORMATION info = {};
  if (!rootIdentity(dir.h, info)) { lastError = ERROR_INVALID_HANDLE; return false; }
  if (!FlushFileBuffers(dir.h)) { lastError = GetLastError(); return false; }
  return true;
}
void printResult(const bool completed, const bool fileSynced,
                 const bool parentSyncReturned, const DWORD osError,
                 const bool mayHaveMutated, const std::string& operation,
                 const EntryObservation* entry = nullptr) {
  std::cout << "{\"kind\":\"VCP_WINDOWS_SCRATCH_NAMESPACE_CANDIDATE\","
    << "\"protocolVersion\":3,"
    << "\"operation\":\"" << operation << "\","
    << "\"completed\":" << (completed ? "true" : "false") << ","
    << "\"fileFlushReturned\":" << (fileSynced ? "true" : "false") << ","
    << "\"mayHaveMutated\":" << (mayHaveMutated ? "true" : "false") << ","
    << "\"directoryFlushReturned\":"
    << (parentSyncReturned ? "true" : "false") << ","
    << "\"lastWin32Error\":" << osError << ","
    << "\"managedMutationAuthorized\":false,"
    << "\"directoryDurabilityProven\":false,"
    << "\"powerLossAttested\":false";
  if(entry && entry->known) {
    std::cout << ",\"entry\":{\"exists\":"
      << (entry->exists ? "true" : "false")
      << ",\"kind\":\"" << entry->type << "\","
      << "\"identity\":\"" << entry->identity << "\","
      << "\"sizeBytes\":\"" << entry->sizeBytes << "\"}";
  }
  std::cout << "}\n";
}
} // namespace

int wmain(int argc, wchar_t* argv[]) {
  if (argc < 5 || argc > 7 || std::wstring(argv[1]) != L"--scratch-root" ||
      std::wstring(argv[3]) != L"--op") return 2;
  std::wstring root, op(argv[4]);
  // Translate only a closed known-command allowlist to ASCII receipts.
  // A wide->narrow iterator conversion previously triggered MSVC C4244 and
  // could silently truncate arbitrary non-ASCII input.
  struct OpName { const wchar_t* wide; const char* ascii; };
  const OpName approved[] = {
    {L"capabilities","capabilities"}, {L"sync-root","sync-root"},
    {L"inspect-entry","inspect-entry"},
    {L"write-exclusive","write-exclusive"},
    {L"rename-no-replace","rename-no-replace"},
    {L"unlink","unlink"}, {L"mkdir-exclusive","mkdir-exclusive"},
    {L"rmdir-empty","rmdir-empty"}
  };
  std::string operation;
  for (const OpName& item : approved) {
    if (op == item.wide) {
      operation = item.ascii;
      break;
    }
  }
  if (operation.empty()) return 2;
  if (!checkedRoot(argv[2], root) || !ntfsVolume(root)) return 3;
  std::vector<Handle> ancestorPins;
  if (!pinAncestorsNoRename(root, ancestorPins) ||
      !safeInventory(root)) return 3;
  // Scratch root denies FILE_SHARE_DELETE; rename requests FILE_ADD_FILE:
  // the scratch-only Win32 fallback below must not follow a moved root
  // between the validated preflight and the absolute-name rename.
  const DWORD rootAccess=FILE_READ_ATTRIBUTES|
      (op==L"rename-no-replace" ? FILE_ADD_FILE : 0);
  Handle rootHandle(CreateFileW(root.c_str(),
      rootAccess,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      nullptr, OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  BY_HANDLE_FILE_INFORMATION first = {}, last = {};
  if (!rootHandle.valid() || !rootIdentity(rootHandle.h, first)) return 3;

  bool completed = false, fileSynced = false, mayHaveMutated = false;
  DWORD err = 0;
  EntryObservation entry = {};
  if (op == L"capabilities" || op == L"sync-root") {
    if (argc != 5) return 2;
    completed = true;
  } else if (op == L"inspect-entry") {
    if(argc!=6 || !allowedName(argv[5]))return 2;
    completed=inspectScratchEntry(root,argv[5],entry,err);
  } else if (op == L"write-exclusive") {
    if (argc != 6 || !allowedName(argv[5])) return 2;
    std::vector<char> payload;
    if (!readBoundedStdin(payload)) return 4;
    completed = writeExclusive(join(root, argv[5]), payload, err,
                               mayHaveMutated);
    fileSynced = completed;
  } else if (op == L"rename-no-replace") {
    if (argc != 7 || !allowedName(argv[5]) ||
        !allowedName(argv[6]) || std::wstring(argv[5]) == argv[6])
      return 2;
    Handle source(CreateFileW(join(root,argv[5]).c_str(),
      DELETE|FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
      nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!source.valid() || !normalOwnedOpen(source.h,false))return 4;
    mayHaveMutated = true; // An attempted OS mutation is never a proved no-op.
    completed = renameOwnedFileNoReplace(source.h,root,argv[6],err);
    if(completed && !verifyRenamedFileIdentity(root,argv[5],argv[6],
                                               source.h)) {
      completed=false;
      err=ERROR_INVALID_DATA; // mayHaveMutated remains true
    }
  } else if (op == L"unlink") {
    if (argc != 6 || !allowedName(argv[5])) return 2;
    // Disposition applies to the already-open file object. Never check
    // one pathname and then DeleteFileW on a potentially different object.
    Handle object(CreateFileW(join(root,argv[5]).c_str(),
      DELETE|FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
      nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!object.valid() || !normalOwnedOpen(object.h,false))return 4;
    mayHaveMutated = true;
    completed = disposeOwnedHandle(object.h,err);
    // The object must be closed before the root inventory is rechecked.
    object=Handle();
    if(completed && !verifyRemovedName(root,argv[5])) {
      completed=false;
      err=ERROR_INVALID_DATA;
    }
  } else if (op == L"mkdir-exclusive") {
    if (argc != 6 || !allowedName(argv[5])) return 2;
    mayHaveMutated = true;
    completed = CreateDirectoryW(join(root, argv[5]).c_str(), nullptr) != 0;
    if (!completed) err = GetLastError();
  } else if (op == L"rmdir-empty") {
    if (argc != 6 || !allowedName(argv[5])) return 2;
    // The OS must enforce directory emptiness at disposition, not via a
    // separate racy pre-enumeration. No recursive deletes are ever used.
    Handle dir(CreateFileW(join(root,argv[5]).c_str(),
      DELETE|FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
      nullptr,OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
    if(!dir.valid() || !normalOwnedOpen(dir.h,true))return 4;
    mayHaveMutated = true;
    completed = disposeOwnedHandle(dir.h,err);
    dir=Handle();
    if(completed && !verifyRemovedName(root,argv[5])) {
      completed=false;
      err=ERROR_INVALID_DATA;
    }
  } else return 2;

  // A held directory handle remains the *same object* after a pathname
  // swap, so comparing only that handle with itself is meaningless.
  // Reopen the ROOT PATH and compare its current identity as well.
  Handle freshRoot(CreateFileW(root.c_str(), FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      nullptr, OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr));
  BY_HANDLE_FILE_INFORMATION fresh = {};
  if (!rootIdentity(rootHandle.h, last) || !sameIdentity(first, last) ||
      !freshRoot.valid() || !rootIdentity(freshRoot.h, fresh) ||
      !sameIdentity(first, fresh) || !safeInventory(root)) {
    // Do not retry or cleanup. Preserve completed work for inspection.
    printResult(completed, fileSynced, false, ERROR_INVALID_HANDLE,
                mayHaveMutated, operation, &entry);
    return 5;
  }
  DWORD syncErr = 0;
  // Read-only identity inspection never requires a successful parent flush.
  // Failure to open/inspect an entry cannot be mistaken for absence.
  if(op == L"inspect-entry") {
    printResult(completed,false,false,err,false,operation,&entry);
    return completed ? 0 : 6;
  }
  // Capabilities deliberately attempts to measure namespace flush support,
  // but its exit code 0 is never evidence of durability.
  const bool directoryFlush = flushRoot(root, syncErr);
  printResult(completed, fileSynced, directoryFlush, syncErr ? syncErr : err,
              mayHaveMutated, operation);
  if (!completed) return 6;
  if (op == L"capabilities") return 0;
  // DirectoryFlush failure remains a hard nonzero acknowledgement.
  return directoryFlush ? 0 : 7;
}
