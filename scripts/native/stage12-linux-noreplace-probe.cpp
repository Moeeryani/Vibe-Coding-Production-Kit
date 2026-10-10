// Linux Stage12 RENAME_NOREPLACE diagnostic, NOT a production move provider.
// Build on native Linux after the full Stage12 HEAD has been frozen:
//   c++ -std=c++17 -Wall -Wextra -O2 -o stage12-linux-noreplace-probe <this-file>
// Run ONLY against a freshly created, disposable test directory that
// contains exactly VCP-STAGE12-DISPOSABLE-ONLY.marker with the exact
// bytes "VCP_STAGE12_DISPOSABLE_TEST_ROOT_ONLY\n".
// Return code 0 means diagnostic ran, never a durable transaction claim.
#ifndef __linux__
#error Native Linux only
#endif
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <cerrno>
#include <cstring>
#include <dirent.h>
#include <fcntl.h>
#include <iostream>
#include <string>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <unistd.h>
#ifndef RENAME_NOREPLACE
#define RENAME_NOREPLACE (1U << 0)
#endif
static constexpr const char* MARKER="VCP-STAGE12-DISPOSABLE-ONLY.marker";
static constexpr const char* CONTENT="VCP_STAGE12_DISPOSABLE_TEST_ROOT_ONLY\n";
static constexpr const char* SOURCE="stage12-noreplace-src";
static constexpr const char* EXISTING="stage12-noreplace-existing";
static constexpr const char* FRESH="stage12-noreplace-fresh";
static bool exists(int dir,const char* name) {
  struct stat st;
  return fstatat(dir,name,&st,AT_SYMLINK_NOFOLLOW)==0;
}
static bool ownDirectory(int dir,const char* name) {
  struct stat st;
  return fstatat(dir,name,&st,AT_SYMLINK_NOFOLLOW)==0 &&
    S_ISDIR(st.st_mode);
}
int main(int argc,char** argv) {
  if(argc!=3||std::string(argv[1])!="--disposable-dir")return 2;
  const std::string root(argv[2]);
  if(root.size()<5||root[0]!='/'||root.find("..")!=std::string::npos)
    return 2;
  int dir=open(root.c_str(),O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
  if(dir<0)return 3;
  struct stat ds;
  if(fstat(dir,&ds)!=0||!S_ISDIR(ds.st_mode)){close(dir);return 3;}
  const int fd=openat(dir,MARKER,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);
  if(fd<0){close(dir);return 3;}
  struct stat ms;
  char buf[128]={0};
  const ssize_t bytes=read(fd,buf,sizeof(buf));
  bool valid=fstat(fd,&ms)==0&&S_ISREG(ms.st_mode)&&
    bytes==static_cast<ssize_t>(std::strlen(CONTENT))&&
    std::memcmp(buf,CONTENT,bytes)==0;
  close(fd);
  if(!valid){close(dir);return 3;}
  DIR* list=fdopendir(dup(dir));
  if(!list){close(dir);return 3;}
  int seen=0;
  while(dirent* item=readdir(list)) {
    const std::string name(item->d_name);
    if(name=="."||name=="..")continue;
    if(name!=MARKER||++seen>1){closedir(list);close(dir);return 3;}
  }
  closedir(list);
  if(seen!=1||exists(dir,SOURCE)||exists(dir,EXISTING)||
    exists(dir,FRESH)){close(dir);return 3;}
  if(mkdirat(dir,SOURCE,0700)!=0){close(dir);return 4;}
  bool createdExisting=mkdirat(dir,EXISTING,0700)==0;
  bool noReplaceDenied=false,originalPreserved=false;
  if(createdExisting) {
    errno=0;
    long collision=syscall(SYS_renameat2,dir,SOURCE,dir,EXISTING,
      RENAME_NOREPLACE);
    noReplaceDenied=collision==-1&&errno==EEXIST;
    originalPreserved=noReplaceDenied&&ownDirectory(dir,SOURCE)&&
      ownDirectory(dir,EXISTING);
  }
  bool freshMove=false,dirSynced=false;
  if(originalPreserved) {
    freshMove=syscall(SYS_renameat2,dir,SOURCE,dir,FRESH,
      RENAME_NOREPLACE)==0;
    if(freshMove)dirSynced=fsync(dir)==0;
  }
  // Fail closed and never recurse. Only remove the names we created in
  // this one-marker disposable test directory.
  if(freshMove&&ownDirectory(dir,FRESH))unlinkat(dir,FRESH,AT_REMOVEDIR);
  else if(ownDirectory(dir,SOURCE))unlinkat(dir,SOURCE,AT_REMOVEDIR);
  if(createdExisting&&ownDirectory(dir,EXISTING))
    unlinkat(dir,EXISTING,AT_REMOVEDIR);
  const bool cleanupSync=fsync(dir)==0;
  close(dir);
  std::cout<<"{\"kind\":\"VCP_STAGE12_LINUX_DISPOSABLE_PROBE\","
    <<"\"noReplaceCollisionDenied\":"<<(noReplaceDenied?"true":"false")<<","
    <<"\"existingDirectoryPreserved\":"<<(originalPreserved?"true":"false")<<","
    <<"\"freshRenameSucceeded\":"<<(freshMove?"true":"false")<<","
    <<"\"directoryFsyncReturned\":"<<(dirSynced?"true":"false")<<","
    <<"\"cleanupFsyncReturned\":"<<(cleanupSync?"true":"false")<<","
    <<"\"isDurabilityAttestation\":false,"
    <<"\"requiresIndependentCrashAndPowerLossProof\":true}\n";
  return 0;
}
