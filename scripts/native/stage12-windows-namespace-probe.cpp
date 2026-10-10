// Windows-native Stage12 research probe — NOT a durability provider.
// Compile with MSVC: cl /W4 /EHsc stage12-windows-namespace-probe.cpp
// Requires an EMPTY disposable scratch directory containing ONLY the exact
// marker created by the operator. NEVER invoke on a real project checkout.
// This probe does NOT certify a crash-consistent filesystem transaction.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cwchar>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

static bool same(const std::wstring& x,const wchar_t *y) {return x==y;}
static bool regular(DWORD attrs) {
  return attrs!=INVALID_FILE_ATTRIBUTES &&
    !(attrs&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT));
}
static std::wstring join(const std::wstring& a,const wchar_t *b) {
  return a+L"\\"+b;
}
static void report(bool dataFlush,bool moveThrough,bool finalFlush,
                   bool directoryFlush,DWORD directoryError,
                   bool mkdirWorked,bool directoryMoveWorked,bool rmdirWorked,
                   bool unlinkWorked,bool noReplaceCollisionDenied,
                   bool collisionDestinationPreserved) {
  std::wcout<<L"{\"kind\":\"VCP_STAGE12_WINDOWS_DISPOSABLE_PROBE\","
    L"\"dataFlush\":"<<(dataFlush?L"true":L"false")<<L","
    L"\"moveThroughReturned\":"<<(moveThrough?L"true":L"false")<<L","
    L"\"renamedFileFlush\":"<<(finalFlush?L"true":L"false")<<L","
    L"\"directoryFlushReturned\":"<<(directoryFlush?L"true":L"false")<<L","
    L"\"directoryError\":"<<directoryError<<L","
    L"\"createDirectoryReturned\":"<<(mkdirWorked?L"true":L"false")<<L","
    L"\"moveDirectoryWriteThroughReturned\":"<<(directoryMoveWorked?L"true":L"false")<<L","
    L"\"removeDirectoryReturned\":"<<(rmdirWorked?L"true":L"false")<<L","
    L"\"deleteFileReturned\":"<<(unlinkWorked?L"true":L"false")<<L","
    L"\"existingDirectoryReplacementDenied\":"<<(noReplaceCollisionDenied?L"true":L"false")<<L","
    L"\"existingDirectoryPreserved\":"<<(collisionDestinationPreserved?L"true":L"false")<<L","
    L"\"isDurabilityAttestation\":false,"
    L"\"requiresIndependentCrashAndPowerLossProof\":true}\n";
}
int wmain(int argc,wchar_t *argv[]) {
  if(argc!=3 || !same(argv[1],L"--disposable-dir")) {
    std::wcerr<<L"Specify --disposable-dir PATH with an operator marker.\n";
    return 2;
  }
  const std::wstring dir(argv[2]);
  if(dir.size()<4 || dir.size()>240 ||
    dir.find(L"..")!=std::wstring::npos) return 2;
  wchar_t canonical[MAX_PATH]={0};
  if(!GetFullPathNameW(dir.c_str(),MAX_PATH,canonical,nullptr))return 2;
  std::wstring root(canonical);
  const DWORD a=GetFileAttributesW(root.c_str());
  if(a==INVALID_FILE_ATTRIBUTES || !(a&FILE_ATTRIBUTE_DIRECTORY) ||
    (a&FILE_ATTRIBUTE_REPARSE_POINT))return 3;
  const std::wstring marker=join(root,L"VCP-STAGE12-DISPOSABLE-ONLY.marker");
  if(!regular(GetFileAttributesW(marker.c_str())))return 3;
  // Fail closed unless this directory contains one and only one marker.
  WIN32_FIND_DATAW item={};
  HANDLE listing=FindFirstFileW(join(root,L"*").c_str(),&item);
  if(listing==INVALID_HANDLE_VALUE)return 3;
  unsigned int count=0;bool markerFound=false;
  do {
    if(same(item.cFileName,L".")||same(item.cFileName,L".."))continue;
    ++count;
    if(same(item.cFileName,L"VCP-STAGE12-DISPOSABLE-ONLY.marker"))
      markerFound=true;
  }while(FindNextFileW(listing,&item));
  FindClose(listing);
  if(count!=1||!markerFound)return 3;
  HANDLE mark=CreateFileW(marker.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,
    OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_OPEN_REPARSE_POINT,nullptr);
  if(mark==INVALID_HANDLE_VALUE)return 3;
  char phrase[64]={};DWORD read=0;
  const BOOL ok=ReadFile(mark,phrase,sizeof(phrase)-1,&read,nullptr);
  CloseHandle(mark);
  const std::string expected="VCP_STAGE12_DISPOSABLE_TEST_ROOT_ONLY\n";
  if(!ok || std::string(phrase,read)!=expected)return 3;
  wchar_t volume[MAX_PATH]={0},fs[MAX_PATH]={0};
  if(!GetVolumePathNameW(root.c_str(),volume,MAX_PATH) ||
    !GetVolumeInformationW(volume,nullptr,0,nullptr,nullptr,nullptr,fs,MAX_PATH)||
    _wcsicmp(fs,L"NTFS")!=0)return 4;
  // Exclusive disposable names under the operator's explicit scratch root.
  const std::wstring src=join(root,L"stage12-native-temporary.bin");
  const std::wstring dest=join(root,L"stage12-native-renamed.bin");
  if(GetFileAttributesW(src.c_str())!=INVALID_FILE_ATTRIBUTES ||
    GetFileAttributesW(dest.c_str())!=INVALID_FILE_ATTRIBUTES)return 5;
  HANDLE fd=CreateFileW(src.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,
    FILE_ATTRIBUTE_NORMAL|FILE_FLAG_WRITE_THROUGH,nullptr);
  if(fd==INVALID_HANDLE_VALUE)return 6;
  const char *payload="VCP_STAGE12_NATIVE_TEST";DWORD written=0;
  const bool writtenOk=WriteFile(fd,payload,
    static_cast<DWORD>(strlen(payload)),&written,nullptr)!=0;
  const bool dataFlush=writtenOk && FlushFileBuffers(fd)!=0;
  CloseHandle(fd);
  const bool moved=dataFlush && MoveFileExW(src.c_str(),dest.c_str(),
    MOVEFILE_WRITE_THROUGH)!=0;
  bool finalFlush=false;
  if(moved) {
    HANDLE renamed=CreateFileW(dest.c_str(),GENERIC_WRITE,FILE_SHARE_READ,
      nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL|FILE_FLAG_WRITE_THROUGH,
      nullptr);
    if(renamed!=INVALID_HANDLE_VALUE) {
      finalFlush=FlushFileBuffers(renamed)!=0;CloseHandle(renamed);
    }
  }
  HANDLE directory=CreateFileW(root.c_str(),GENERIC_WRITE,
    FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,
    OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,
    nullptr);
  bool dirFlush=false;DWORD dirError=0;
  if(directory==INVALID_HANDLE_VALUE)dirError=GetLastError();
  else {
    dirFlush=FlushFileBuffers(directory)!=0;
    if(!dirFlush)dirError=GetLastError();
    CloseHandle(directory);
  }
  const std::wstring dirSrc=join(root,L"stage12-native-dir-before");
  const std::wstring dirDst=join(root,L"stage12-native-dir-after");
  bool directoryCreated=false,directoryMoved=false,directoryRemoved=false;
  if(GetFileAttributesW(dirSrc.c_str())==INVALID_FILE_ATTRIBUTES &&
    GetFileAttributesW(dirDst.c_str())==INVALID_FILE_ATTRIBUTES) {
    directoryCreated=CreateDirectoryW(dirSrc.c_str(),nullptr)!=0;
    directoryMoved=directoryCreated &&
      MoveFileExW(dirSrc.c_str(),dirDst.c_str(),MOVEFILE_WRITE_THROUGH)!=0;
    if(directoryMoved)directoryRemoved=RemoveDirectoryW(dirDst.c_str())!=0;
  }
  // Independent no-replace collision axis: precreate two fresh scratch
  // directories and deliberately attempt to rename into an existing target.
  // The API MUST reject replacement; never delete a directory not created
  // by this probe. Observations are not a power-loss attestation.
  const std::wstring collideSrc=join(root,L"stage12-noreplace-src");
  const std::wstring collideDest=join(root,L"stage12-noreplace-dest");
  bool collisionDenied=false,collisionPreserved=false;
  if(GetFileAttributesW(collideSrc.c_str())==INVALID_FILE_ATTRIBUTES &&
    GetFileAttributesW(collideDest.c_str())==INVALID_FILE_ATTRIBUTES) {
    const bool first=CreateDirectoryW(collideSrc.c_str(),nullptr)!=0;
    const bool second=first &&
      CreateDirectoryW(collideDest.c_str(),nullptr)!=0;
    if(second) {
      collisionDenied=MoveFileExW(collideSrc.c_str(),collideDest.c_str(),
        MOVEFILE_WRITE_THROUGH)==0;
      const DWORD sourceAttributes=GetFileAttributesW(collideSrc.c_str());
      const DWORD destAttributes=GetFileAttributesW(collideDest.c_str());
      collisionPreserved=collisionDenied &&
        sourceAttributes!=INVALID_FILE_ATTRIBUTES &&
        (sourceAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0 &&
        destAttributes!=INVALID_FILE_ATTRIBUTES &&
        (destAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0;
      if(collisionPreserved) {
        RemoveDirectoryW(collideSrc.c_str());
        RemoveDirectoryW(collideDest.c_str());
      }
    }else if(first)RemoveDirectoryW(collideSrc.c_str());
  }
  // Do not recurse or force-remove unknown content; report leftover bytes.
  if(GetFileAttributesW(dirSrc.c_str())!=INVALID_FILE_ATTRIBUTES)
    RemoveDirectoryW(dirSrc.c_str());
  bool deleted=false;
  if(GetFileAttributesW(src.c_str())!=INVALID_FILE_ATTRIBUTES)
    deleted=DeleteFileW(src.c_str())!=0;
  else if(GetFileAttributesW(dest.c_str())!=INVALID_FILE_ATTRIBUTES)
    deleted=DeleteFileW(dest.c_str())!=0;
  report(dataFlush,moved,finalFlush,dirFlush,dirError,
    directoryCreated,directoryMoved,directoryRemoved,deleted,
    collisionDenied,collisionPreserved);
  // 0 ONLY means the diagnostic ran. There is NO OS durability attestation.
  return 0;
}
