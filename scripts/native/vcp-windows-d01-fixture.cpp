// D-01 Windows NTFS disposable TWO-PRINCIPAL fixture provisioner.
//
// Creates only ONE brand-new random directory below the OS-known
// FOLDERID_ProgramData (no caller-provided path), with a PROTECTED DACL
// established atomically on CreateDirectoryW/CreateFileW. Never edits any
// preexisting project, never deletes/renames anything, never approves D-01.
//
// Security nuance: old SID must be a DISTINCT REAL user, with a token that
// can TRAVERSE ProgramData and READ the fixture. Old-token BA membership,
// elevated privileges, inherited parent FILE_DELETE_CHILD, account-owner
// rights, and post-crash durability require actual separate-token proofs.
// This provisioning receipt alone is unconditionally NO_GO.
//
// Requires elevated Windows process and explicit opt-in environment +
// --old-sid / --writer-sid for two independently provisioned accounts.
// Compiler: MSVC C++17, Advapi32.lib, Shell32.lib, Ole32.lib, Bcrypt.lib.
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shlobj.h>
#include <knownfolders.h>
#include <sddl.h>
#include <bcrypt.h>
#include <string>
#include <vector>
#include <iostream>
#include <cstdio>

struct LocalBuffer {
  void* ptr=nullptr;
  ~LocalBuffer(){if(ptr)LocalFree(ptr);}
};
struct CoBuffer {
  PWSTR ptr=nullptr;
  ~CoBuffer(){if(ptr)CoTaskMemFree(ptr);}
};
struct Handle {
  HANDLE h=INVALID_HANDLE_VALUE;
  explicit Handle(HANDLE x=INVALID_HANDLE_VALUE):h(x){}
  ~Handle(){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);}
  Handle(const Handle&)=delete;
  Handle& operator=(const Handle&)=delete;
  bool valid()const{return h!=INVALID_HANDLE_VALUE;}
};
void error(const char* code,DWORD win32=0){
  std::cerr<<code<<" win32="<<win32<<"\n";
}
std::wstring append(const std::wstring& a,const std::wstring& b){
  return a.back()==L'\\'?a+b:a+L"\\"+b;
}
bool oneSid(const std::wstring& candidate,LocalBuffer& allocated,
            std::wstring& canonical){
  if(candidate.size()<7||candidate.size()>184||
     candidate.compare(0,4,L"S-1-")!=0)return false;
  PSID sid=nullptr;
  if(!ConvertStringSidToSidW(candidate.c_str(),&sid))return false;
  allocated.ptr=sid;
  if(!IsValidSid(sid))return false;
  LPWSTR converted=nullptr;
  if(!ConvertSidToStringSidW(sid,&converted))return false;
  canonical.assign(converted);
  LocalFree(converted);
  if(canonical!=candidate)return false;
  DWORD userLength=0,domainLength=0;
  SID_NAME_USE kind=SidTypeUnknown;
  LookupAccountSidW(nullptr,sid,nullptr,&userLength,nullptr,
                    &domainLength,&kind);
  if(GetLastError()!=ERROR_INSUFFICIENT_BUFFER||
     userLength==0||domainLength>1024)return false;
  std::vector<wchar_t> user(userLength+1),domain(domainLength+1);
  if(!LookupAccountSidW(nullptr,sid,user.data(),&userLength,
                        domain.data(),&domainLength,&kind))
    return false;
  return kind==SidTypeUser;
}
bool elevatedAndDistinct(PSID oldSid,PSID writerSid){
  if(EqualSid(oldSid,writerSid))return false;
  Handle token;
  if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&token.h))
    return false;
  TOKEN_ELEVATION elevated={};
  DWORD received=0;
  if(!GetTokenInformation(token.h,TokenElevation,&elevated,
      sizeof(elevated),&received)||!elevated.TokenIsElevated)
    return false;
  DWORD needed=0;
  GetTokenInformation(token.h,TokenUser,nullptr,0,&needed);
  if(!needed||needed>16384)return false;
  std::vector<BYTE> bytes(needed);
  if(!GetTokenInformation(token.h,TokenUser,bytes.data(),needed,&received))
    return false;
  const TOKEN_USER* user=reinterpret_cast<const TOKEN_USER*>(bytes.data());
  // The provisioner must NEVER be run under either adversarial identity.
  return !EqualSid(user->User.Sid,oldSid)&&
         !EqualSid(user->User.Sid,writerSid);
}
bool globalBase(std::wstring& base){
  CoBuffer known;
  if(FAILED(SHGetKnownFolderPath(FOLDERID_ProgramData,KF_FLAG_DEFAULT,
                                 nullptr,&known.ptr))||!known.ptr)
    return false;
  base.assign(known.ptr);
  if(base.size()<4||base.size()>175||base[1]!=L':'||
     base[2]!=L'\\'||base.find(L'/')!=std::wstring::npos||
     base.find(L"..")!=std::wstring::npos)return false;
  while(base.size()>3&&base.back()==L'\\')base.pop_back();
  wchar_t full[260]={};
  const DWORD length=GetFullPathNameW(base.c_str(),260,full,nullptr);
  if(!length||length>=260||base!=full)return false;
  // Never create inside an existing symlink/junction ancestor.
  std::wstring current=base.substr(0,3);
  size_t start=3;
  while(true){
    const DWORD flags=GetFileAttributesW(current.c_str());
    if(flags==INVALID_FILE_ATTRIBUTES||
       (flags&FILE_ATTRIBUTE_DIRECTORY)==0||
       (flags&FILE_ATTRIBUTE_REPARSE_POINT)!=0)return false;
    if(start>=base.size())break;
    const size_t next=base.find(L'\\',start);
    current=append(current,base.substr(start,next-start));
    if(next==std::wstring::npos)break;
    start=next+1;
  }
  wchar_t volume[MAX_PATH]={},kind[MAX_PATH]={};
  if(!GetVolumePathNameW(base.c_str(),volume,MAX_PATH)||
     !GetVolumeInformationW(volume,nullptr,0,nullptr,nullptr,nullptr,
                            kind,MAX_PATH))return false;
  return _wcsicmp(kind,L"NTFS")==0;
}
std::wstring randomLeaf(){
  BYTE value[16]={};
  const NTSTATUS result=BCryptGenRandom(nullptr,value,sizeof(value),
                                       BCRYPT_USE_SYSTEM_PREFERRED_RNG);
  if(result<0)return L"";
  const wchar_t digits[]=L"0123456789abcdef";
  std::wstring name=L"vcp-win-d01-isolation-";
  for(BYTE b:value){
    name.push_back(digits[b>>4]);
    name.push_back(digits[b&15]);
  }
  return name;
}
std::string utf8(const std::wstring& w){
  if(w.empty())return "";
  int bytes=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,
    w.c_str(),static_cast<int>(w.size()),nullptr,0,nullptr,nullptr);
  if(bytes<=0)return "";
  std::string out(static_cast<size_t>(bytes),'\0');
  if(!WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,w.c_str(),
                         static_cast<int>(w.size()),&out[0],bytes,
                         nullptr,nullptr))return "";
  return out;
}
std::string json(const std::wstring& w){
  const std::string in=utf8(w);
  std::string out="\"";
  for(unsigned char c:in){
    if(c=='"'||c=='\\'){out.push_back('\\');out.push_back(char(c));}
    else if(c<32){
      const char digits[]="0123456789abcdef";
      out+="\\u00";
      out.push_back(digits[c>>4]);
      out.push_back(digits[c&15]);
    }else out.push_back(char(c));
  }
  out.push_back('"');return out;
}
bool createDir(const std::wstring& directory,
               SECURITY_ATTRIBUTES& acl){
  return CreateDirectoryW(directory.c_str(),&acl)!=FALSE;
}
bool exclusiveFile(const std::wstring& filename,
                   const std::string& bytes,
                   SECURITY_ATTRIBUTES& acl){
  Handle h(CreateFileW(filename.c_str(),GENERIC_WRITE,0,&acl,CREATE_NEW,
                       FILE_ATTRIBUTE_NORMAL,nullptr));
  if(!h.valid())return false;
  DWORD written=0;
  if(bytes.size()>65536)return false;
  if(!WriteFile(h.h,bytes.data(),static_cast<DWORD>(bytes.size()),
                &written,nullptr)||written!=bytes.size())return false;
  // A returned file-buffer flush does NOT establish namespace durability.
  return FlushFileBuffers(h.h)!=FALSE;
}
bool verifyObject(const std::wstring& p,bool expectedDirectory){
  Handle h(CreateFileW(p.c_str(),FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ,nullptr,OPEN_EXISTING,
    FILE_FLAG_OPEN_REPARSE_POINT|FILE_FLAG_BACKUP_SEMANTICS,nullptr));
  if(!h.valid())return false;
  BY_HANDLE_FILE_INFORMATION info={};
  if(!GetFileInformationByHandle(h.h,&info))return false;
  const bool directory=(info.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0;
  return directory==expectedDirectory&&
    (info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)==0&&
    (directory||info.nNumberOfLinks==1);
}
int wmain(int argc,wchar_t* argv[]){
  if(argc!=5||std::wstring(argv[1])!=L"--old-sid"||
     std::wstring(argv[3])!=L"--writer-sid"){
    error("E_D01_WINDOWS_FIXTURE_USAGE");return 2;
  }
  wchar_t agreement[90]={};
  const DWORD n=GetEnvironmentVariableW(L"VCP_D01_WINDOWS_DISPOSABLE",
                                        agreement,90);
  if(!n||n>=90||
     std::wstring(agreement)!=L"I_ACCEPT_NEW_PROGRAMDATA_FIXTURE_ONLY"){
    error("E_D01_WINDOWS_FIXTURE_EXPLICIT_OPT_IN");return 2;
  }
  LocalBuffer oldAllocation,writerAllocation;
  std::wstring oldName,writerName;
  if(!oneSid(argv[2],oldAllocation,oldName)||
     !oneSid(argv[4],writerAllocation,writerName)||
     !elevatedAndDistinct(oldAllocation.ptr,writerAllocation.ptr)){
    error("E_D01_WINDOWS_FIXTURE_DISTINCT_ELEVATED_TOKENS_REQUIRED");
    return 3;
  }
  std::wstring base;
  if(!globalBase(base)){
    error("E_D01_WINDOWS_FIXTURE_GLOBAL_BASE_UNTRUSTED");return 3;
  }
  // Both SIDs are known real users. Their effective group memberships,
  // privileges and whether either is an admin remain unproved here.
  const std::wstring sddl=L"D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"
    L"(A;OICI;FA;;;"+writerName+L")(A;OICI;FR;;;"+oldName+L")";
  PSECURITY_DESCRIPTOR sd=nullptr;
  if(!ConvertStringSecurityDescriptorToSecurityDescriptorW(
      sddl.c_str(),SDDL_REVISION_1,&sd,nullptr)){
    error("E_D01_WINDOWS_FIXTURE_SD_INVALID",GetLastError());return 4;
  }
  LocalBuffer security;
  security.ptr=sd;
  SECURITY_ATTRIBUTES attrs={sizeof(SECURITY_ATTRIBUTES),sd,FALSE};
  std::wstring root;
  // No caller-selected destination. Unique cryptographically randomized
  // CREATE_ONLY root name; no retry against an existing root path.
  const std::wstring leaf=randomLeaf();
  if(leaf.empty()){
    error("E_D01_WINDOWS_FIXTURE_RNG");return 4;
  }
  root=append(base,leaf);
  if(root.size()>240||!createDir(root,attrs)){
    error("E_D01_WINDOWS_FIXTURE_CREATE_ROOT",GetLastError());
    return 4;
  }
  // After this point NEVER automatically remove the root on any error.
  // Partial diagnostics are retained for independent forensic inspection.
  const std::string marker="VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY\n";
  if(!exclusiveFile(append(root,L"VCP-D01-READONLY-DISPOSABLE.marker"),
                    marker,attrs)){
    error("E_D01_WINDOWS_FIXTURE_MARKER",GetLastError());return 5;
  }
  for(const std::wstring& variant:{
      std::wstring(L"with-manifest"),
      std::wstring(L"without-manifest")}){
    const std::wstring project=append(root,variant);
    const std::wstring state=append(project,L".vcp");
    if(!createDir(project,attrs)||!createDir(state,attrs)||
       !exclusiveFile(append(project,L"AGENTS.md"),
           "VCP_D01_PROTECTED_USER_BYTES_DO_NOT_MODIFY\n",attrs)){
      error("E_D01_WINDOWS_FIXTURE_PROJECT",GetLastError());return 5;
    }
    if(variant==L"with-manifest"&&
       !exclusiveFile(append(state,L"manifest.json"),
         "{\"D01_disposable_only\":true}\n",attrs)){
      error("E_D01_WINDOWS_FIXTURE_MANIFEST",GetLastError());return 5;
    }
    if(!verifyObject(project,true)||!verifyObject(state,true)||
       !verifyObject(append(project,L"AGENTS.md"),false)){
      error("E_D01_WINDOWS_FIXTURE_IDENTITY",GetLastError());return 5;
    }
  }
  if(!verifyObject(root,true)||
     !verifyObject(append(root,L"VCP-D01-READONLY-DISPOSABLE.marker"),
                   false)){
    error("E_D01_WINDOWS_FIXTURE_IDENTITY",GetLastError());return 5;
  }
  std::cout<<"{\"kind\":\"D01_WINDOWS_DISPOSABLE_FIXTURE_V1\","
    <<"\"status\":\"NO_GO\",\"root\":"<<json(root)<<","
    <<"\"oldSid\":"<<json(oldName)<<","
    <<"\"writerSid\":"<<json(writerName)<<","
    <<"\"location\":\"ProgramData\",\"ntfs\":true,"
    <<"\"manifestVariants\":[\"with-manifest\",\"without-manifest\"],"
    <<"\"filesCreatedOnly\":true,\"selectedProjectTouched\":false,"
    <<"\"actualOldTokenTested\":false,"
    <<"\"parentRenameDenialProven\":false,"
    <<"\"writerPositiveControlProven\":false,"
    <<"\"namespacePowerLossDurabilityProven\":false,"
    <<"\"d01Approved\":false,\"managedMutationAuthorized\":false,"
    <<"\"cleanupAuthorized\":false}\n";
  return 3; // Always NO_GO. Independent native token tests are next.
}
