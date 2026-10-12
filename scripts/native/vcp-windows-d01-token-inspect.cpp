// D-01 Windows native NTFS principal/ACL diagnostic, READ ONLY.
// Deliberately separate from vcp-windows-fsops scratch writer. It never
// calls any filesystem mutation API and NEVER approves managed v2 writes.
//
// Probe must run TWICE under independently provisioned actual old and new
// Windows security tokens in a throwaway NTFS fixture. SID-name / DACL-only
// calculations do not reproduce a real restricted token's group privileges.
//
// Compile with MSVC: cl /nologo /std:c++17 /W4 /WX /EHsc
//   vcp-windows-d01-token-inspect.cpp /link advapi32.lib /Brepro
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <aclapi.h>
#include <sddl.h>
#include <string>
#include <vector>
#include <iostream>
#include <algorithm>

struct OwnedHandle {
  HANDLE h=INVALID_HANDLE_VALUE;
  explicit OwnedHandle(HANDLE v=INVALID_HANDLE_VALUE):h(v){}
  ~OwnedHandle(){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);}
  OwnedHandle(const OwnedHandle&)=delete;
  OwnedHandle& operator=(const OwnedHandle&)=delete;
  bool ok()const{return h!=INVALID_HANDLE_VALUE;}
};
struct ScopedSd {
  PSECURITY_DESCRIPTOR p=nullptr;
  ~ScopedSd(){if(p)LocalFree(p);}
};
const wchar_t* MARK=L"VCP-D01-READONLY-DISPOSABLE.marker";
const char* MARK_BYTES="VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY\n";
bool same(const std::wstring& a,const wchar_t* b){return a==b;}
std::wstring join(const std::wstring& x,const std::wstring& y){
  return x.back()==L'\\'?x+y:x+L"\\"+y;
}
bool safeRoot(const std::wstring& x) {
  if(x.size()<8||x.size()>235||x[1]!=L':'||x[2]!=L'\\'||
     x.find(L"..")!=std::wstring::npos||
     x.find(L'/')!=std::wstring::npos||
     x.find(L"\\\\")!=std::wstring::npos)return false;
  std::wstring::size_type last=x.find_last_of(L'\\');
  if(last==std::wstring::npos||last+1>=x.size())return false;
  const std::wstring leaf=x.substr(last+1);
  if(leaf.rfind(L"vcp-win-d01-isolation-",0)!=0||
     leaf.size()<23)return false;
  wchar_t absolute[260]={};
  const DWORD n=GetFullPathNameW(x.c_str(),260,absolute,nullptr);
  return n>0&&n<260&&x==absolute;
}
bool noReparseAncestors(const std::wstring& root){
  std::wstring current=root.substr(0,3);
  size_t offset=3;
  for(;;){
    const DWORD attrs=GetFileAttributesW(current.c_str());
    if(attrs==INVALID_FILE_ATTRIBUTES||
       (attrs&FILE_ATTRIBUTE_DIRECTORY)==0||
       (attrs&FILE_ATTRIBUTE_REPARSE_POINT)!=0)return false;
    if(offset>=root.size())break;
    const size_t stop=root.find(L'\\',offset);
    current=join(current,root.substr(offset,stop-offset));
    if(stop==std::wstring::npos)break;
    offset=stop+1;
  }
  return true;
}
bool validMarker(const std::wstring& root){
  OwnedHandle f(CreateFileW(join(root,MARK).c_str(),GENERIC_READ,
    FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,
    nullptr));
  if(!f.ok())return false;
  BY_HANDLE_FILE_INFORMATION info={};
  if(!GetFileInformationByHandle(f.h,&info)||
     (info.dwFileAttributes&(FILE_ATTRIBUTE_REPARSE_POINT|
                              FILE_ATTRIBUTE_DIRECTORY))!=0||
     info.nNumberOfLinks!=1)return false;
  char bytes[128]={};DWORD received=0;
  if(!ReadFile(f.h,bytes,sizeof(bytes),&received,nullptr)||
     received!=lstrlenA(MARK_BYTES))return false;
  return std::string(bytes,bytes+received)==MARK_BYTES;
}
bool ntfs(const std::wstring& root){
  wchar_t volume[MAX_PATH]={},filesystem[MAX_PATH]={};
  return GetVolumePathNameW(root.c_str(),volume,MAX_PATH)!=0&&
    GetVolumeInformationW(volume,nullptr,0,nullptr,nullptr,nullptr,
                          filesystem,MAX_PATH)!=0&&
    _wcsicmp(filesystem,L"NTFS")==0;
}
std::wstring currentSid(HANDLE token){
  DWORD needed=0;
  GetTokenInformation(token,TokenUser,nullptr,0,&needed);
  if(!needed||needed>16384)return L"";
  std::vector<BYTE> buffer(needed);
  if(!GetTokenInformation(token,TokenUser,buffer.data(),needed,&needed))
    return L"";
  const auto* u=reinterpret_cast<const TOKEN_USER*>(buffer.data());
  LPWSTR sid=nullptr;
  if(!ConvertSidToStringSidW(u->User.Sid,&sid))return L"";
  std::wstring result(sid);
  LocalFree(sid);
  return result;
}
bool impersonation(HANDLE primary,OwnedHandle& target){
  HANDLE duplicate=INVALID_HANDLE_VALUE;
  if(!DuplicateToken(primary,SecurityImpersonation,&duplicate))
    return false;
  target.h=duplicate;return true;
}
struct Check {
  bool completed=false;
  bool granted=false;
  DWORD error=0;
};
Check checkRight(PSECURITY_DESCRIPTOR sd,HANDLE imp,DWORD requested){
  GENERIC_MAPPING mapping={FILE_GENERIC_READ,FILE_GENERIC_WRITE,
    FILE_GENERIC_EXECUTE,FILE_ALL_ACCESS};
  DWORD privilegeBytes=4096;
  std::vector<BYTE> privilege(privilegeBytes);
  DWORD granted=0;
  BOOL allowed=FALSE;
  if(!AccessCheck(sd,imp,requested,&mapping,
     reinterpret_cast<PPRIVILEGE_SET*>(privilege.data()),
     &privilegeBytes,&granted,&allowed)){
    return {false,false,GetLastError()};
  }
  return {true,allowed!=FALSE,0};
}
struct Observed {
  std::wstring label;
  bool opened=false,looksSafe=false;
  bool deleteGranted=false,childDeleteGranted=false;
  bool writeGranted=false,ownerChangeGranted=false;
  bool daclChangeGranted=false,checksCompleted=false;
  DWORD lastError=0;
};
Observed inspect(const std::wstring& p,const std::wstring& label,
                 HANDLE impersonate,bool directory){
  Observed r;r.label=label;
  OwnedHandle handle(CreateFileW(p.c_str(),
    FILE_READ_ATTRIBUTES|READ_CONTROL,
    FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,
    OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT|
    FILE_FLAG_BACKUP_SEMANTICS,nullptr));
  if(!handle.ok()){r.lastError=GetLastError();return r;}
  BY_HANDLE_FILE_INFORMATION identity={};
  if(!GetFileInformationByHandle(handle.h,&identity)){
    r.lastError=GetLastError();return r;
  }
  if((identity.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)!=0||
     ((identity.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0)!=directory||
     (!directory&&identity.nNumberOfLinks!=1)){
    r.lastError=ERROR_INVALID_DATA;return r;
  }
  r.opened=true;
  ScopedSd sd;
  PACL dacl=nullptr;PSID owner=nullptr,group=nullptr;
  r.lastError=GetSecurityInfo(handle.h,SE_FILE_OBJECT,
    OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|
      DACL_SECURITY_INFORMATION,
    &owner,&group,&dacl,nullptr,&sd.p);
  if(r.lastError!=ERROR_SUCCESS||!sd.p)return r;
  const Check del=checkRight(sd.p,impersonate,DELETE);
  const Check child=directory?
    checkRight(sd.p,impersonate,FILE_DELETE_CHILD):
    Check{true,false,0};
  const Check write=checkRight(sd.p,impersonate,directory?
    FILE_ADD_FILE|FILE_ADD_SUBDIRECTORY:FILE_WRITE_DATA|FILE_APPEND_DATA);
  const Check own=checkRight(sd.p,impersonate,WRITE_OWNER);
  const Check acl=checkRight(sd.p,impersonate,WRITE_DAC);
  r.checksCompleted=del.completed&&child.completed&&write.completed&&
    own.completed&&acl.completed;
  if(!r.checksCompleted){
    r.lastError=del.error?del.error:child.error?child.error:
      write.error?write.error:own.error?own.error:acl.error;
    return r;
  }
  r.deleteGranted=del.granted;
  r.childDeleteGranted=child.granted;
  r.writeGranted=write.granted;
  r.ownerChangeGranted=own.granted;
  r.daclChangeGranted=acl.granted;
  r.looksSafe=!(r.deleteGranted||r.childDeleteGranted||
    r.writeGranted||r.ownerChangeGranted||r.daclChangeGranted);
  return r;
}
void print(const std::wstring& sid,const std::wstring& project,
           const std::vector<Observed>& observations){
  std::wcout<<L"{\"kind\":\"D01_WINDOWS_TOKEN_ACL_READONLY_V1\","
    L"\"status\":\"NO_GO\",\"platform\":\"win32\","
    L"\"nativeWindows\":true,\"productionProject\":false,"
    L"\"managedMutationAuthorized\":false,"
    L"\"publishedLegacyCliTested\":false,"
    L"\"nativePowerLossAttested\":false,"
    L"\"D01Approved\":false,"
    L"\"principalSid\":\""<<sid<<L"\","
    L"\"projectVariant\":\""<<project<<L"\",\"observations\":[";
  for(size_t i=0;i<observations.size();i++){
    const Observed& o=observations[i];
    if(i)std::wcout<<L",";
    std::wcout<<L"{\"object\":\""<<o.label<<L"\",\"opened\":"
      <<(o.opened?L"true":L"false")<<L",\"checked\":"
      <<(o.checksCompleted?L"true":L"false")<<L",\"write\":"
      <<(o.writeGranted?L"true":L"false")<<L",\"delete\":"
      <<(o.deleteGranted?L"true":L"false")<<L",\"deleteChild\":"
      <<(o.childDeleteGranted?L"true":L"false")<<L",\"writeDacl\":"
      <<(o.daclChangeGranted?L"true":L"false")<<L",\"writeOwner\":"
      <<(o.ownerChangeGranted?L"true":L"false")<<L",\"looksSafe\":"
      <<(o.looksSafe?L"true":L"false")<<L",\"lastWin32Error\":"
      <<o.lastError<<L"}";
  }
  std::wcout<<L"],\"accessCheckOnly\":true,"
    L"\"oldPrincipalActualMutationDenialUnproven\":true}\n";
}
int wmain(int argc,wchar_t* argv[]){
  if(argc!=5||!same(argv[1],L"--scratch-root")||
     !same(argv[3],L"--variant"))return 2;
  const std::wstring root(argv[2]),variant(argv[4]);
  if(!safeRoot(root)||!noReparseAncestors(root)||!ntfs(root)||
     !validMarker(root)||
     (!same(variant,L"with-manifest")&&
      !same(variant,L"without-manifest")))return 3;
  OwnedHandle token;
  if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY|TOKEN_DUPLICATE,
                       &token.h))return 4;
  OwnedHandle imp;
  if(!impersonation(token.h,imp))return 4;
  const std::wstring sid=currentSid(token.h);
  if(sid.empty())return 4;
  const std::wstring project=join(root,variant);
  std::vector<Observed> observations;
  // Inspect every parent up to the volume root, not only the protected
  // file. Replace-at-parent is part of the old CLI attack surface.
  std::wstring directory=root.substr(0,3);
  observations.push_back(inspect(directory,L"drive-root",imp.h,true));
  size_t offset=3;unsigned index=0;
  while(offset<root.size()){
    size_t next=root.find(L'\\',offset);
    directory=join(directory,root.substr(offset,next-offset));
    observations.push_back(inspect(directory,
      L"ancestor-"+std::to_wstring(++index),imp.h,true));
    if(next==std::wstring::npos)break;
    offset=next+1;
  }
  observations.push_back(inspect(project,L"project",imp.h,true));
  observations.push_back(inspect(join(project,L".vcp"),L"state",imp.h,true));
  observations.push_back(inspect(join(project,L"AGENTS.md"),
    L"agents",imp.h,false));
  if(same(variant,L"with-manifest"))
    observations.push_back(inspect(join(project,L".vcp\\manifest.json"),
      L"manifest",imp.h,false));
  print(sid,variant,observations);
  // Never return 0 as a "good fence" signal; caller must independently
  // replay real published 0.9.3 operations with a distinct native token.
  return 3;
}
