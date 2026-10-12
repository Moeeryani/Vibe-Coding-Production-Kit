// D-01 Windows immutable-fixture NTFS FORENSIC SNAPSHOT v1.
// Read-only, no filesystem mutations, NO_GO forever.
// The only allowed root is a direct child of OS-known NTFS ProgramData,
// created by the D01 new-only fixture provisioner. A live snapshot is NOT
// a transactional point-in-time guarantee or power-loss attestation.
//
// IMPORTANT: every handle allows FILE_SHARE_DELETE. This program cannot
// accidentally "prove" old CLI rename denial through a sharing violation
// caused by its own open handles. Take before/after snapshots SEQUENTIALLY.
// Never infer live Windows write-path exclusion solely from this receipt.
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shlobj.h>
#include <knownfolders.h>
#include <objbase.h>
#include <bcrypt.h>
#include <string>
#include <sstream>
#include <iomanip>
#include <vector>
#include <iostream>

struct Handle{
 HANDLE h=INVALID_HANDLE_VALUE;
 explicit Handle(HANDLE v=INVALID_HANDLE_VALUE):h(v){}
 ~Handle(){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);}
 Handle(const Handle&)=delete;Handle& operator=(const Handle&)=delete;
 bool good()const{return h!=INVALID_HANDLE_VALUE;}
};
struct Com{
 HRESULT status=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
 ~Com(){if(SUCCEEDED(status))CoUninitialize();}
};
struct Digest{
 BCRYPT_ALG_HANDLE algorithm=nullptr;
 BCRYPT_HASH_HANDLE hash=nullptr;
 ~Digest(){if(hash)BCryptDestroyHash(hash);
           if(algorithm)BCryptCloseAlgorithmProvider(algorithm,0);}
 bool open(){
  return BCryptOpenAlgorithmProvider(&algorithm,
    BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0&&
    BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0)>=0;
 }
};
std::wstring joined(const std::wstring& a,const std::wstring& b){
 return a.back()==L'\\'?a+b:a+L"\\"+b;
}
bool hex24(const std::wstring& x){
 if(x.size()!=24)return false;
 for(wchar_t c:x)if(!((c>=L'0'&&c<=L'9')||
                       (c>=L'a'&&c<=L'f')))return false;
 return true;
}
std::string ascii(const std::wstring& x){
 if(!hex24(x))return "";
 std::string result;
 for(wchar_t c:x)result.push_back(static_cast<char>(c));
 return result;
}
std::wstring identity(HANDLE h){
 BY_HANDLE_FILE_INFORMATION info={};
 if(!GetFileInformationByHandle(h,&info)||
    (info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))return L"";
 std::wostringstream out;
 out<<std::hex<<std::setfill(L'0')
    <<std::setw(8)<<info.dwVolumeSerialNumber
    <<std::setw(8)<<info.nFileIndexHigh
    <<std::setw(8)<<info.nFileIndexLow;
 return out.str();
}
bool exactRoot(const std::wstring& root){
 if(root.size()<35||root.size()>235||root[1]!=L':'||
    root[2]!=L'\\'||root.find(L"..")!=std::wstring::npos||
    root.find(L'/')!=std::wstring::npos||
    root.find(L"\\\\")!=std::wstring::npos)return false;
 const size_t slash=root.find_last_of(L'\\');
 if(slash==std::wstring::npos)return false;
 const std::wstring prefix=L"vcp-win-d01-isolation-";
 const std::wstring leaf=root.substr(slash+1);
 if(leaf.size()!=prefix.size()+32||
    leaf.compare(0,prefix.size(),prefix)!=0)return false;
 for(size_t i=prefix.size();i<leaf.size();i++){
  wchar_t c=leaf[i];
  if(!((c>=L'0'&&c<=L'9')||
       (c>=L'a'&&c<=L'f')))return false;
 }
 wchar_t canonical[MAX_PATH]={};
 const DWORD length=GetFullPathNameW(root.c_str(),MAX_PATH,canonical,nullptr);
 if(length==0||length>=MAX_PATH||root!=canonical)return false;
 Com apartment;
 if(FAILED(apartment.status))return false;
 PWSTR raw=nullptr;
 const HRESULT got=SHGetKnownFolderPath(FOLDERID_ProgramData,
   KF_FLAG_DEFAULT,nullptr,&raw);
 if(FAILED(got)||!raw){
  if(raw)CoTaskMemFree(raw);
  return false;
 }
 std::wstring base(raw);CoTaskMemFree(raw);
 while(base.size()>3&&base.back()==L'\\')base.pop_back();
 if(_wcsicmp(root.substr(0,slash).c_str(),base.c_str())!=0)return false;
 // No junction/reparse anywhere in the volume/root namespace path.
 std::wstring current=base.substr(0,3);
 size_t offset=3;
 while(true){
  DWORD attributes=GetFileAttributesW(current.c_str());
  if(attributes==INVALID_FILE_ATTRIBUTES||
     (attributes&(FILE_ATTRIBUTE_DIRECTORY|
                  FILE_ATTRIBUTE_REPARSE_POINT))!=FILE_ATTRIBUTE_DIRECTORY)
    return false;
  if(offset>=root.size())break;
  size_t next=root.find(L'\\',offset);
  current=joined(current,root.substr(offset,next-offset));
  if(next==std::wstring::npos)break;
  offset=next+1;
 }
 wchar_t volume[MAX_PATH]={},fs[MAX_PATH]={};
 return GetVolumePathNameW(root.c_str(),volume,MAX_PATH)!=0&&
  GetVolumeInformationW(volume,nullptr,0,nullptr,nullptr,nullptr,
                        fs,MAX_PATH)!=0&&_wcsicmp(fs,L"NTFS")==0;
}
Handle openRead(const std::wstring& full,bool directory){
 return Handle(CreateFileW(full.c_str(),
   FILE_READ_DATA|FILE_READ_ATTRIBUTES,
   FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,
   OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT|
   (directory?FILE_FLAG_BACKUP_SEMANTICS:0),nullptr));
}
struct Snapshot{
 std::string sha;
 std::wstring id;
 bool valid=false;
};
Snapshot fileSnapshot(const std::wstring& name,
                      const std::string* exactLiteral=nullptr){
 Handle h=openRead(name,false);
 if(!h.good())return {};
 BY_HANDLE_FILE_INFORMATION before={};
 if(!GetFileInformationByHandle(h.h,&before)||
    (before.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                              FILE_ATTRIBUTE_REPARSE_POINT))!=0||
    before.nNumberOfLinks!=1||before.nFileSizeHigh!=0||
    before.nFileSizeLow>131072)return {};
 Digest digest;
 if(!digest.open())return {};
 std::string bytes;
 char buffer[4096]={};
 for(;;){
  DWORD n=0;
  if(!ReadFile(h.h,buffer,sizeof(buffer),&n,nullptr))return {};
  if(n==0)break;
  if(bytes.size()+n>131072)return {};
  if(exactLiteral)bytes.append(buffer,n);
  if(BCryptHashData(digest.hash,
     reinterpret_cast<PUCHAR>(buffer),n,0)<0)return {};
 }
 BYTE value[32]={};
 if(BCryptFinishHash(digest.hash,value,32,0)<0)return {};
 BY_HANDLE_FILE_INFORMATION after={};
 if(!GetFileInformationByHandle(h.h,&after)||
    before.dwVolumeSerialNumber!=after.dwVolumeSerialNumber||
    before.nFileIndexHigh!=after.nFileIndexHigh||
    before.nFileIndexLow!=after.nFileIndexLow||
    before.nFileSizeHigh!=after.nFileSizeHigh||
    before.nFileSizeLow!=after.nFileSizeLow||
    (exactLiteral&&bytes!=*exactLiteral))return {};
 std::ostringstream hex;
 hex<<std::hex<<std::setfill('0');
 for(BYTE b:value)hex<<std::setw(2)<<static_cast<unsigned>(b);
 return {hex.str(),identity(h.h),true};
}
bool missing(const std::wstring& name){
 const DWORD attributes=GetFileAttributesW(name.c_str());
 return attributes==INVALID_FILE_ATTRIBUTES&&
        GetLastError()==ERROR_FILE_NOT_FOUND;
}
bool snapshotRoot(HANDLE handle,const std::wstring& wanted){
 BY_HANDLE_FILE_INFORMATION st={};
 return GetFileInformationByHandle(handle,&st)!=0&&
   (st.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                         FILE_ATTRIBUTE_REPARSE_POINT))==
     FILE_ATTRIBUTE_DIRECTORY&&identity(handle)==wanted;
}
int wmain(int argc,wchar_t* argv[]){
 if(argc!=9||std::wstring(argv[1])!=L"--scratch-root"||
    std::wstring(argv[3])!=L"--variant"||
    std::wstring(argv[5])!=L"--root-id"||
    std::wstring(argv[7])!=L"--project-id")return 2;
 const std::wstring root=argv[2],variant=argv[4],
   expectedRoot=argv[6],expectedProject=argv[8];
 if(!exactRoot(root)||!hex24(expectedRoot)||!hex24(expectedProject)||
    (variant!=L"with-manifest"&&variant!=L"without-manifest"))return 4;
 const std::wstring project=joined(root,variant);
 Handle rootHandle=openRead(root,true),projectHandle=openRead(project,true);
 if(!rootHandle.good()||!projectHandle.good()||
    !snapshotRoot(rootHandle.h,expectedRoot)||
    !snapshotRoot(projectHandle.h,expectedProject))return 5;
 const std::string markerExpected=
   "VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY\n";
 const std::wstring marker=joined(root,
   L"VCP-D01-READONLY-DISPOSABLE.marker");
 const Snapshot mark=fileSnapshot(marker,&markerExpected);
 if(!mark.valid)return 5;
 const std::wstring agentsName=joined(project,L"AGENTS.md");
 const std::wstring manifestName=joined(joined(project,L".vcp"),
                                       L"manifest.json");
 const Snapshot agents=fileSnapshot(agentsName);
 const bool withManifest=variant==L"with-manifest";
 const Snapshot manifest=withManifest?fileSnapshot(manifestName):Snapshot{};
 if(!agents.valid||!hex24(agents.id)||
    (withManifest?(!manifest.valid||!hex24(manifest.id)):
      !missing(manifestName))||
    !snapshotRoot(rootHandle.h,expectedRoot)||
    !snapshotRoot(projectHandle.h,expectedProject))return 5;
 std::cout<<"{\"kind\":\"D01_WINDOWS_NATIVE_PROTECTED_SNAPSHOT_V1\","
   <<"\"status\":\"NO_GO\",\"variant\":\""
   <<(withManifest?"with-manifest":"without-manifest")<<"\","
   <<"\"rootIdentity\":\""<<ascii(expectedRoot)<<"\","
   <<"\"projectIdentity\":\""<<ascii(expectedProject)<<"\","
   <<"\"agentsSha256\":\""<<agents.sha<<"\","
   <<"\"agentsFileIdentity\":\""<<ascii(agents.id)<<"\","
   <<"\"manifestSha256\":";
 if(withManifest)std::cout<<"\""<<manifest.sha<<"\"";
 else std::cout<<"null";
 std::cout<<",\"manifestFileIdentity\":";
 if(withManifest)std::cout<<"\""<<ascii(manifest.id)<<"\"";
 else std::cout<<"null";
 std::cout<<",\"readOnly\":true,\"sharesDelete\":true,"
   <<"\"nativeNtfs\":true,\"markerVerified\":true,"
   <<"\"snapshotAtomicityProven\":false,"
   <<"\"oldCliExecutionProven\":false,"
   <<"\"powerLossDurabilityProven\":false,"
   <<"\"managedMutationAuthorized\":false,\"d01Approved\":false}\n";
 return 3; // Even an exact snapshot is never an approval.
}
