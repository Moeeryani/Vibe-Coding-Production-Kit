// D-01 Windows OLD TOKEN kernel-denial witness, disposable NTFS fixture ONLY.
// Requires marker, direct OS-known ProgramData child, expected root/project
// NTFS IDs and actual unprivileged OLD TokenUser SID. No arbitrary paths.
// Attempts an exclusive new file and a no-replace rename ONLY in scratch.
// Success leaves forensic artifacts and refuses further mutation; no cleanup.
// Even a PASS is NOT evidence of published-0.9.3 denial or power durability.
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <sddl.h>
#include <shlobj.h>
#include <knownfolders.h>
#include <objbase.h>
#include <string>
#include <vector>
#include <iostream>
#include <sstream>
#include <iomanip>
struct H {
 HANDLE h=INVALID_HANDLE_VALUE;
 explicit H(HANDLE x=INVALID_HANDLE_VALUE):h(x){}
 ~H(){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);}
 H(const H&)=delete;H& operator=(const H&)=delete;
 bool ok()const{return h!=INVALID_HANDLE_VALUE;}
};
struct COM {
 HRESULT h=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
 ~COM(){if(SUCCEEDED(h))CoUninitialize();}
};
std::wstring join(const std::wstring& a,const std::wstring& b){
 return a.back()==L'\\'?a+b:a+L"\\"+b;
}
std::wstring identity(HANDLE h){
 BY_HANDLE_FILE_INFORMATION i={};
 if(!GetFileInformationByHandle(h,&i)||
    (i.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))return L"";
 std::wostringstream out;
 out<<std::hex<<std::setfill(L'0')<<std::setw(8)<<i.dwVolumeSerialNumber
    <<std::setw(8)<<i.nFileIndexHigh<<std::setw(8)<<i.nFileIndexLow;
 return out.str();
}
bool validId(const std::wstring& i){
 if(i.size()!=24)return false;
 for(wchar_t c:i)if(!((c>=L'0'&&c<=L'9')||
                        (c>=L'a'&&c<=L'f')))return false;
 return true;
}
bool safeRoot(const std::wstring& root){
 if(root.size()<35||root.size()>235||root[1]!=L':'||
    root[2]!=L'\\'||root.find(L'/')!=std::wstring::npos||
    root.find(L"..")!=std::wstring::npos||
    root.find(L"\\\\")!=std::wstring::npos)return false;
 const size_t at=root.find_last_of(L'\\');
 if(at==std::wstring::npos)return false;
 const std::wstring leaf=root.substr(at+1),prefix=L"vcp-win-d01-isolation-";
 if(leaf.size()!=prefix.size()+32||
    leaf.compare(0,prefix.size(),prefix)!=0)return false;
 for(size_t i=prefix.size();i<leaf.size();i++)
   if(!((leaf[i]>=L'0'&&leaf[i]<=L'9')||
        (leaf[i]>=L'a'&&leaf[i]<=L'f')))return false;
 wchar_t full[260]={};
 const DWORD n=GetFullPathNameW(root.c_str(),260,full,nullptr);
 if(!n||n>=260||root!=full)return false;
 COM apartment;
 if(FAILED(apartment.h))return false;
 PWSTR raw=nullptr;
 const HRESULT hr=SHGetKnownFolderPath(FOLDERID_ProgramData,
                                       KF_FLAG_DEFAULT,nullptr,&raw);
 if(FAILED(hr)||!raw){if(raw)CoTaskMemFree(raw);return false;}
 std::wstring base(raw);CoTaskMemFree(raw);
 while(base.size()>3&&base.back()==L'\\')base.pop_back();
 if(_wcsicmp(root.substr(0,at).c_str(),base.c_str())!=0)return false;
 wchar_t mount[MAX_PATH]={},fs[MAX_PATH]={};
 return GetVolumePathNameW(base.c_str(),mount,MAX_PATH)!=0&&
  GetVolumeInformationW(mount,nullptr,0,nullptr,nullptr,nullptr,
                        fs,MAX_PATH)!=0&&_wcsicmp(fs,L"NTFS")==0;
}
bool oldToken(const std::wstring& expected){
 H t;
 if(!OpenProcessToken(GetCurrentProcess(),TOKEN_QUERY,&t.h))return false;
 DWORD n=0;GetTokenInformation(t.h,TokenUser,nullptr,0,&n);
 if(n==0||n>16384)return false;
 std::vector<BYTE> buf(n);
 if(!GetTokenInformation(t.h,TokenUser,buf.data(),n,&n))return false;
 LPWSTR raw=nullptr;
 if(!ConvertSidToStringSidW(
    reinterpret_cast<TOKEN_USER*>(buf.data())->User.Sid,&raw))return false;
 const bool match=std::wstring(raw)==expected;
 LocalFree(raw);if(!match)return false;
 TOKEN_ELEVATION elevated={};DWORD read=0;
 if(!GetTokenInformation(t.h,TokenElevation,&elevated,
                         sizeof(elevated),&read)||
    elevated.TokenIsElevated)return false;
 BYTE administrators[SECURITY_MAX_SID_SIZE]={};DWORD length=sizeof(administrators);
 BOOL member=FALSE;
 if(!CreateWellKnownSid(WinBuiltinAdministratorsSid,nullptr,
                        administrators,&length)||
    !CheckTokenMembership(nullptr,administrators,&member)||member)return false;
 // A token that may re-enable powerful privileges is not a valid test.
 DWORD len=0;GetTokenInformation(t.h,TokenPrivileges,nullptr,0,&len);
 if(!len||len>32768)return false;
 std::vector<BYTE> bytes(len);
 if(!GetTokenInformation(t.h,TokenPrivileges,bytes.data(),len,&len))
    return false;
 const auto* priv=reinterpret_cast<TOKEN_PRIVILEGES*>(bytes.data());
 const wchar_t* banned[]={SE_BACKUP_NAME,SE_RESTORE_NAME,
   SE_TAKE_OWNERSHIP_NAME,SE_DEBUG_NAME,SE_IMPERSONATE_NAME};
 for(const auto* p:banned){
   LUID id={};
   if(!LookupPrivilegeValueW(nullptr,p,&id))return false;
   for(DWORD i=0;i<priv->PrivilegeCount;i++)
     if(priv->Privileges[i].Luid.HighPart==id.HighPart&&
        priv->Privileges[i].Luid.LowPart==id.LowPart)return false;
 }
 return true;
}
bool pin(const std::wstring& s,std::vector<HANDLE>& list){
 H h(CreateFileW(s.c_str(),FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
 if(!h.ok())return false;
 BY_HANDLE_FILE_INFORMATION i={};
 if(!GetFileInformationByHandle(h.h,&i)||
    (i.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                         FILE_ATTRIBUTE_REPARSE_POINT))!=
      FILE_ATTRIBUTE_DIRECTORY)return false;
 list.push_back(h.h);h.h=INVALID_HANDLE_VALUE;return true;
}
std::wstring fileId(const std::wstring& p){
 H h(CreateFileW(p.c_str(),FILE_READ_ATTRIBUTES,
  FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
  nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
 if(!h.ok())return L"";
 BY_HANDLE_FILE_INFORMATION info={};
 if(!GetFileInformationByHandle(h.h,&info)||
   info.nNumberOfLinks!=1||
   (info.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                            FILE_ATTRIBUTE_REPARSE_POINT)))return L"";
 return identity(h.h);
}
bool content(const std::wstring& p,const std::string& value){
 H h(CreateFileW(p.c_str(),GENERIC_READ,
   FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
   nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
 if(!h.ok())return false;
 BY_HANDLE_FILE_INFORMATION i={};
 if(!GetFileInformationByHandle(h.h,&i)||i.nNumberOfLinks!=1||
   (i.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                        FILE_ATTRIBUTE_REPARSE_POINT)))return false;
 char b[256]={};DWORD n=0;
 return ReadFile(h.h,b,sizeof(b),&n,nullptr)!=0&&
   n==value.size()&&std::string(b,b+n)==value;
}
struct Right {
 const char* label;
 DWORD error=0;
 bool granted=false;
};
Right rights(const char* label,const std::wstring& p,DWORD access,bool dir){
 H h(CreateFileW(p.c_str(),access,FILE_SHARE_READ|FILE_SHARE_WRITE|
   FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,
   FILE_FLAG_OPEN_REPARSE_POINT|(dir?FILE_FLAG_BACKUP_SEMANTICS:0),
   nullptr));
 return {label,h.ok()?0:GetLastError(),h.ok()};
}
bool absent(const std::wstring& p){
 const DWORD v=GetFileAttributesW(p.c_str());
 return v==INVALID_FILE_ATTRIBUTES&&GetLastError()==ERROR_FILE_NOT_FOUND;
}
int wmain(int argc,wchar_t* argv[]){
 if(argc!=11||std::wstring(argv[1])!=L"--scratch-root"||
   std::wstring(argv[3])!=L"--variant"||
   std::wstring(argv[5])!=L"--old-sid"||
   std::wstring(argv[7])!=L"--root-id"||
   std::wstring(argv[9])!=L"--project-id")return 2;
 wchar_t consent[80]={};
 const DWORD chars=GetEnvironmentVariableW(
   L"VCP_D01_WINDOWS_OLD_DENIAL",consent,80);
 if(!chars||chars>=80||
    std::wstring(consent)!=L"I_ACCEPT_DISPOSABLE_ONLY")return 2;
 const std::wstring root=argv[2],variant=argv[4],sid=argv[6];
 const std::wstring rootId=argv[8],projectId=argv[10];
 if(!safeRoot(root)||!validId(rootId)||!validId(projectId)||
   (variant!=L"with-manifest"&&variant!=L"without-manifest")||
   !oldToken(sid))return 4;
 std::vector<HANDLE> pinned;
 auto close=[&](){for(HANDLE h:pinned)CloseHandle(h);};
 std::wstring cursor=root.substr(0,3);
 bool ok=pin(cursor,pinned);
 size_t at=3;
 while(ok&&at<root.size()){
   const size_t next=root.find(L'\\',at);
   cursor=join(cursor,root.substr(at,next-at));
   ok=pin(cursor,pinned);
   if(next==std::wstring::npos)break;
   at=next+1;
 }
 const std::wstring project=join(root,variant);
 ok=ok&&pin(project,pinned);
 const std::wstring state=join(project,L".vcp");
 ok=ok&&pin(state,pinned);
 if(!ok){close();return 5;}
 const size_t count=pinned.size();
 if(count<4||identity(pinned[count-3])!=rootId||
    identity(pinned[count-2])!=projectId){close();return 5;}
 const std::wstring agent=join(project,L"AGENTS.md");
 const std::wstring marker=join(root,L"VCP-D01-READONLY-DISPOSABLE.marker");
 const std::wstring manifest=join(state,L"manifest.json");
 const std::string markerText="VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY\n";
 const std::string agentText="VCP_D01_PROTECTED_USER_BYTES_DO_NOT_MODIFY\n";
 const std::string manifestText="{\"D01_disposable_only\":true}\n";
 const bool hasManifest=variant==L"with-manifest";
 const std::wstring agentId=fileId(agent);
 const std::wstring manifestId=hasManifest?fileId(manifest):L"";
 const bool before=content(marker,markerText)&&content(agent,agentText)&&
   validId(agentId)&&(!hasManifest||validId(manifestId))&&
   (hasManifest?content(manifest,manifestText):absent(manifest));
 if(!before){close();return 5;}
 const std::wstring base=root.substr(0,root.find_last_of(L'\\'));
 const std::vector<Right> observed={
   rights("agentWrite",agent,FILE_WRITE_DATA,false),
   rights("agentAppend",agent,FILE_APPEND_DATA,false),
   rights("agentDelete",agent,DELETE,false),
   rights("agentOwner",agent,WRITE_OWNER,false),
   rights("agentDacl",agent,WRITE_DAC,false),
   rights("projectAdd",project,FILE_ADD_FILE,true),
   rights("projectDeleteChild",project,FILE_DELETE_CHILD,true),
   rights("projectDelete",project,DELETE,true),
   rights("rootDeleteChild",root,FILE_DELETE_CHILD,true),
   rights("programDataDeleteChild",base,FILE_DELETE_CHILD,true)
 };
 bool allDenied=true;
 for(const auto& r:observed)
   if(r.granted||r.error!=ERROR_ACCESS_DENIED)allDenied=false;
 const std::wstring create=join(state,L"vcp-d01-old-create-probe.bin");
 const std::wstring moved=join(project,L"AGENTS.md.vcp-d01-old-moved");
 bool createAttempted=false,createSucceeded=false;
 bool renameAttempted=false,renameSucceeded=false;
 DWORD createError=0,renameError=0;
 if(allDenied&&absent(create)&&absent(moved)){
   createAttempted=true;
   H h(CreateFileW(create.c_str(),FILE_WRITE_DATA,
      FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
      nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr));
   createSucceeded=h.ok();
   if(!createSucceeded)createError=GetLastError();
   if(!createSucceeded&&createError==ERROR_ACCESS_DENIED){
     renameAttempted=true;
     renameSucceeded=MoveFileExW(agent.c_str(),moved.c_str(),0)!=0;
     if(!renameSucceeded)renameError=GetLastError();
   }
 }
 const bool bytesSafe=content(agent,agentText)&&
   (hasManifest?content(manifest,manifestText):absent(manifest));
 const bool noNew=absent(create)&&absent(moved);
 const bool idsSafe=identity(pinned[count-3])==rootId&&
                    identity(pinned[count-2])==projectId&&
                    fileId(agent)==agentId&&
                    (!hasManifest||fileId(manifest)==manifestId);
 close();
 const bool denied=allDenied&&createAttempted&&!createSucceeded&&
   createError==ERROR_ACCESS_DENIED&&renameAttempted&&
   !renameSucceeded&&renameError==ERROR_ACCESS_DENIED&&
   bytesSafe&&noNew&&idsSafe;
 std::cout<<"{\"kind\":\"D01_WINDOWS_OLD_TOKEN_KERNEL_DENIAL_V1\","
   <<"\"status\":\"NO_GO\",\"variant\":\""
   <<(hasManifest?"with-manifest":"without-manifest")<<"\","
   <<"\"rootIdentity\":\""<<std::string(rootId.begin(),rootId.end())<<"\","
   <<"\"projectIdentity\":\""<<std::string(projectId.begin(),projectId.end())<<"\","
   <<"\"oldTokenSidMatched\":true,"
   <<"\"dangerousOpenRightsAllDenied\":"<<(allDenied?"true":"false")
   <<",\"actualCreateAttempted\":"<<(createAttempted?"true":"false")
   <<",\"actualCreateSucceeded\":"<<(createSucceeded?"true":"false")
   <<",\"actualCreateWin32Error\":"<<createError
   <<",\"actualRenameAttempted\":"<<(renameAttempted?"true":"false")
   <<",\"actualRenameSucceeded\":"<<(renameSucceeded?"true":"false")
   <<",\"actualRenameWin32Error\":"<<renameError
   <<",\"protectedBytesUnchanged\":"<<(bytesSafe?"true":"false")
   <<",\"noUnexpectedNewEntries\":"<<(noNew?"true":"false")
   <<",\"ntfsIdentitiesPreserved\":"<<(idsSafe?"true":"false")
   <<",\"kernelFixtureDenialObserved\":"<<(denied?"true":"false")
   <<",\"publishedLegacyCliTested\":false,"
   <<"\"productionMutationAuthorized\":false,"
   <<"\"WindowsNamespaceDurabilityProven\":false,"
   <<"\"d01Approved\":false}\n";
 return 3;
}
