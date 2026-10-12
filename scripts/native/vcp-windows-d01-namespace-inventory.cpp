// D01 NTFS disposable-project FULL namespace inventory (READ ONLY).
// NO production writes, no folder cleanup, no privilege grants, NO_GO.
// Do not run concurrently with published-old CLI: a sequence of path reads
// cannot prove an atomic Windows NTFS snapshot or durable namespace flush.
// Handles use FILE_SHARE_DELETE so this tool cannot itself create an
// apparent old-CLI rename denial. All reparse points and hardlinks refused.
#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE
#include <windows.h>
#include <shlobj.h>
#include <knownfolders.h>
#include <objbase.h>
#include <bcrypt.h>
#include <aclapi.h>
#include <sddl.h>
#include <cstddef>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>
#include <iostream>
#include <iomanip>
#include <sstream>

struct Handle {
 HANDLE h=INVALID_HANDLE_VALUE;
 explicit Handle(HANDLE value=INVALID_HANDLE_VALUE):h(value){}
 ~Handle(){if(h!=INVALID_HANDLE_VALUE)CloseHandle(h);}
 Handle(const Handle&)=delete;Handle& operator=(const Handle&)=delete;
 bool ok()const{return h!=INVALID_HANDLE_VALUE;}
};
struct Com {
 HRESULT state=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
 ~Com(){if(SUCCEEDED(state))CoUninitialize();}
};
struct Cng {
 BCRYPT_ALG_HANDLE algorithm=nullptr;
 BCRYPT_HASH_HANDLE hash=nullptr;
 ~Cng(){if(hash)BCryptDestroyHash(hash);
        if(algorithm)BCryptCloseAlgorithmProvider(algorithm,0);}
 bool start(){
  return BCryptOpenAlgorithmProvider(&algorithm,
    BCRYPT_SHA256_ALGORITHM,nullptr,0)>=0&&
    BCryptCreateHash(algorithm,&hash,nullptr,0,nullptr,0,0)>=0;
 }
};
struct Entry {
 std::string relative;
 std::string type;
 std::string identity;
 std::string digest;
 DWORD size=0;
 DWORD attributes=0;
 std::string securitySha256;
};
constexpr DWORD FILE_LIMIT=131072;
constexpr DWORD TOTAL_LIMIT=2097152;
constexpr size_t ENTRY_LIMIT=512;
constexpr unsigned DEPTH_LIMIT=10;
std::wstring join(const std::wstring& a,const std::wstring& b){
 return a.back()==L'\\'?a+b:a+L"\\"+b;
}
bool hex24(const std::wstring& value){
 if(value.size()!=24)return false;
 for(wchar_t c:value)
  if(!((c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f')))return false;
 return true;
}
std::string id(HANDLE handle){
 BY_HANDLE_FILE_INFORMATION info={};
 if(!GetFileInformationByHandle(handle,&info)||
    (info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))return "";
 std::ostringstream out;
 out<<std::hex<<std::setfill('0')
    <<std::setw(8)<<info.dwVolumeSerialNumber
    <<std::setw(8)<<info.nFileIndexHigh<<std::setw(8)<<info.nFileIndexLow;
 return out.str();
}
bool simpleName(const std::wstring& name){
 if(name.empty()||name.size()>96||name==L"."||name==L".."||
    name.find(L"..")!=std::wstring::npos)return false;
 for(wchar_t c:name)
  if(!((c>=L'a'&&c<=L'z')||(c>=L'A'&&c<=L'Z')||
       (c>=L'0'&&c<=L'9')||c==L'.'||c==L'_'||
       c==L'-'||c==L'+'))return false;
 return true;
}
std::string ascii(const std::wstring& value){
 std::string result;
 result.reserve(value.size());
 for(wchar_t c:value){
  if(c>127)return "";
  result.push_back(static_cast<char>(c));
 }
 return result;
}
bool trustedRoot(const std::wstring& root){
 if(root.size()<35||root.size()>215||
    root[1]!=L':'||root[2]!=L'\\'||
    root.find(L"..")!=std::wstring::npos||
    root.find(L'/')!=std::wstring::npos||
    root.find(L"\\\\")!=std::wstring::npos)return false;
 const size_t split=root.find_last_of(L'\\');
 if(split==std::wstring::npos)return false;
 const std::wstring leaf=root.substr(split+1);
 const std::wstring prefix=L"vcp-win-d01-isolation-";
 if(leaf.size()!=prefix.size()+32||
    leaf.compare(0,prefix.size(),prefix)!=0)return false;
 for(size_t i=prefix.size();i<leaf.size();i++){
  const wchar_t c=leaf[i];
  if(!((c>=L'0'&&c<=L'9')||(c>=L'a'&&c<=L'f')))return false;
 }
 wchar_t normalized[MAX_PATH]={};
 const DWORD len=GetFullPathNameW(root.c_str(),MAX_PATH,normalized,nullptr);
 if(!len||len>=MAX_PATH||root!=normalized)return false;
 Com com;
 if(FAILED(com.state))return false;
 PWSTR raw=nullptr;
 const HRESULT hr=SHGetKnownFolderPath(
   FOLDERID_ProgramData,KF_FLAG_DEFAULT,nullptr,&raw);
 if(FAILED(hr)||!raw){if(raw)CoTaskMemFree(raw);return false;}
 std::wstring base(raw);CoTaskMemFree(raw);
 while(base.size()>3&&base.back()==L'\\')base.pop_back();
 if(_wcsicmp(root.substr(0,split).c_str(),base.c_str())!=0)return false;
 // Check the entire root namespace for junction/reparse ancestors.
 std::wstring current=root.substr(0,3);
 size_t offset=3;
 for(;;){
  const DWORD attr=GetFileAttributesW(current.c_str());
  if(attr==INVALID_FILE_ATTRIBUTES||
     (attr&(FILE_ATTRIBUTE_REPARSE_POINT|
            FILE_ATTRIBUTE_DIRECTORY))!=FILE_ATTRIBUTE_DIRECTORY)
    return false;
  if(offset>=root.size())break;
  const size_t sep=root.find(L'\\',offset);
  current=join(current,root.substr(offset,sep-offset));
  if(sep==std::wstring::npos)break;
  offset=sep+1;
 }
 wchar_t volume[MAX_PATH]={},fs[MAX_PATH]={};
 return GetVolumePathNameW(root.c_str(),volume,MAX_PATH)!=0&&
   GetVolumeInformationW(volume,nullptr,0,nullptr,nullptr,nullptr,
                         fs,MAX_PATH)!=0&&_wcsicmp(fs,L"NTFS")==0;
}
Handle openPath(const std::wstring& name,bool directory){
 return Handle(CreateFileW(name.c_str(),
   READ_CONTROL|FILE_READ_ATTRIBUTES|(directory?0:FILE_READ_DATA),
   FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,
   nullptr,OPEN_EXISTING,
   FILE_FLAG_OPEN_REPARSE_POINT|
     (directory?FILE_FLAG_BACKUP_SEMANTICS:0),nullptr));
}
// Fail closed on NTFS alternate named streams: a file's default $DATA
// digest alone does not detect mutations to hidden ADS. An unsupported
// enumeration result is NOT an assertion that streams are absent.
bool unnamedStreamOnly(HANDLE h){
 alignas(8) BYTE buffer[8192]={};
 if(!GetFileInformationByHandleEx(h,FileStreamInfo,buffer,
     static_cast<DWORD>(sizeof(buffer)))){
  return GetLastError()==ERROR_HANDLE_EOF;
 }
 const auto* entry=reinterpret_cast<const FILE_STREAM_INFO*>(buffer);
 constexpr wchar_t standard[]=L"::$DATA";
 const DWORD bytes=static_cast<DWORD>(sizeof(standard)-sizeof(wchar_t));
 return entry->NextEntryOffset==0&&
   entry->StreamNameLength==bytes&&
   std::memcmp(entry->StreamName,standard,bytes)==0;
}
std::string securityDigest(HANDLE h){
 PSECURITY_DESCRIPTOR descriptor=nullptr;
 const DWORD result=GetSecurityInfo(h,SE_FILE_OBJECT,
   OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|
     DACL_SECURITY_INFORMATION,
   nullptr,nullptr,nullptr,nullptr,&descriptor);
 if(result!=ERROR_SUCCESS||!descriptor)return "";
 // SDDL serializes owner, group and DACL without absolute descriptor
 // pointers; hashing the raw GetSecurityInfo buffer is not stable.
 LPWSTR canonical=nullptr;
 ULONG canonicalChars=0;
 const BOOL converted=ConvertSecurityDescriptorToStringSecurityDescriptorW(
   descriptor,SDDL_REVISION_1,
   OWNER_SECURITY_INFORMATION|GROUP_SECURITY_INFORMATION|
     DACL_SECURITY_INFORMATION,
   &canonical,&canonicalChars);
 std::string hash;
 if(converted&&canonical&&canonicalChars>0&&canonicalChars<=32768){
  const size_t bytes=static_cast<size_t>(canonicalChars)*sizeof(wchar_t);
  Cng cng;
  if(cng.start()&&BCryptHashData(cng.hash,
      reinterpret_cast<PUCHAR>(canonical),static_cast<ULONG>(bytes),0)>=0){
   BYTE output[32]={};
   if(BCryptFinishHash(cng.hash,output,32,0)>=0){
    std::ostringstream hex;
    hex<<std::hex<<std::setfill('0');
    for(BYTE value:output)
     hex<<std::setw(2)<<static_cast<unsigned>(value);
    hash=hex.str();
   }
  }
 }
 if(canonical)LocalFree(canonical);
 LocalFree(descriptor);
 return hash;
}
bool metadata(HANDLE h,DWORD& attrs,std::string& security){
 BY_HANDLE_FILE_INFORMATION info={};
 if(!GetFileInformationByHandle(h,&info)||
    (info.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)!=0||
    !unnamedStreamOnly(h))return false;
 attrs=info.dwFileAttributes;
 security=securityDigest(h);
 return security.size()==64;
}
bool identityMatches(const std::wstring& name,bool directory,
                     const std::string& identity){
 Handle h=openPath(name,directory);
 if(!h.ok())return false;
 BY_HANDLE_FILE_INFORMATION st={};
 if(!GetFileInformationByHandle(h.h,&st)||
    (st.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)||
    ((st.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY)!=0)!=directory||
    !unnamedStreamOnly(h.h))
   return false;
 return id(h.h)==identity;
}
bool hashFile(const std::wstring& name,Entry& entry,DWORD& totalBytes){
 Handle file=openPath(name,false);
 if(!file.ok())return false;
 BY_HANDLE_FILE_INFORMATION before={};
 if(!GetFileInformationByHandle(file.h,&before)||
    (before.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                              FILE_ATTRIBUTE_REPARSE_POINT))!=0||
    before.nNumberOfLinks!=1||before.nFileSizeHigh!=0||
    before.nFileSizeLow>FILE_LIMIT||
    !metadata(file.h,entry.attributes,entry.securitySha256))return false;
 const DWORD originalAttributes=entry.attributes;
 const std::string originalSecurity=entry.securitySha256;
 Cng digest;
 if(!digest.start())return false;
 DWORD readTotal=0;
 BYTE buffer[4096]={};
 for(;;){
  DWORD got=0;
  if(!ReadFile(file.h,buffer,sizeof(buffer),&got,nullptr))return false;
  if(got==0)break;
  if(got>FILE_LIMIT-readTotal||got>TOTAL_LIMIT-totalBytes)
    return false;
  readTotal+=got;totalBytes+=got;
  if(BCryptHashData(digest.hash,buffer,got,0)<0)return false;
 }
 BYTE hashed[32]={};
 if(BCryptFinishHash(digest.hash,hashed,32,0)<0)return false;
 BY_HANDLE_FILE_INFORMATION after={};
 if(!GetFileInformationByHandle(file.h,&after)||
    after.nFileSizeHigh!=0||readTotal!=after.nFileSizeLow||
    before.nFileSizeLow!=after.nFileSizeLow||
    before.dwVolumeSerialNumber!=after.dwVolumeSerialNumber||
    before.nFileIndexHigh!=after.nFileIndexHigh||
    before.nFileIndexLow!=after.nFileIndexLow||
    before.ftLastWriteTime.dwLowDateTime!=
      after.ftLastWriteTime.dwLowDateTime||
    before.ftLastWriteTime.dwHighDateTime!=
      after.ftLastWriteTime.dwHighDateTime)return false;
 DWORD finalAttributes=0;
 std::string finalSecurity;
 if(!metadata(file.h,finalAttributes,finalSecurity)||
    originalAttributes!=finalAttributes||
    originalSecurity!=finalSecurity)return false;
 entry.identity=id(file.h);
 if(entry.identity.size()!=24)return false;
 entry.size=readTotal;
 std::ostringstream stream;
 stream<<std::hex<<std::setfill('0');
 for(BYTE value:hashed)
   stream<<std::setw(2)<<static_cast<unsigned>(value);
 entry.digest=stream.str();
 return entry.digest.size()==64;
}
bool walk(const std::wstring& dir,const std::string& relative,
          unsigned depth,std::vector<Entry>& entries,DWORD& bytes){
 if(depth>=DEPTH_LIMIT||dir.size()>242)return false;
 Handle handle=openPath(dir,true);
 if(!handle.ok())return false;
 BY_HANDLE_FILE_INFORMATION before={};
 if(!GetFileInformationByHandle(handle.h,&before)||
    (before.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                              FILE_ATTRIBUTE_REPARSE_POINT))!=
      FILE_ATTRIBUTE_DIRECTORY)return false;
 const std::string dirId=id(handle.h);
 DWORD dirAttributes=0;
 std::string dirSecurity;
 if(dirId.size()!=24||
    !metadata(handle.h,dirAttributes,dirSecurity))return false;
 WIN32_FIND_DATAW found={};
 const std::wstring mask=join(dir,L"*");
 HANDLE find=FindFirstFileW(mask.c_str(),&found);
 if(find==INVALID_HANDLE_VALUE){
  // The only permitted empty-enumeration status. Never interpret denied
  // or ambiguous scan failures as an empty directory.
  if(GetLastError()!=ERROR_FILE_NOT_FOUND)return false;
 }else{
  bool valid=true;
  do{
   const std::wstring leaf(found.cFileName);
   if(leaf==L"."||leaf==L"..")continue;
   if(!simpleName(leaf)||entries.size()>=ENTRY_LIMIT){
    valid=false;break;
   }
   const bool isDir=(found.dwFileAttributes&
     FILE_ATTRIBUTE_DIRECTORY)!=0;
   if(found.dwFileAttributes&FILE_ATTRIBUTE_REPARSE_POINT){
    valid=false;break;
   }
   const std::string rel=relative.empty()?ascii(leaf):
     relative+"/"+ascii(leaf);
   const std::wstring full=join(dir,leaf);
   if(full.size()>246||rel.size()>200){
    valid=false;break;
   }
   Entry e;e.relative=rel;e.type=isDir?"directory":"file";
   if(isDir){
    Handle next=openPath(full,true);
    if(!next.ok()){
     valid=false;break;
    }
    BY_HANDLE_FILE_INFORMATION st={};
    if(!GetFileInformationByHandle(next.h,&st)||
       (st.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                             FILE_ATTRIBUTE_REPARSE_POINT))!=
         FILE_ATTRIBUTE_DIRECTORY){
     valid=false;break;
    }
    e.identity=id(next.h);
    if(e.identity.size()!=24||
       !metadata(next.h,e.attributes,e.securitySha256)){
     valid=false;break;
    }
    entries.push_back(e);
    DWORD attrsAfter=0;
    std::string securityAfter;
    if(!walk(full,rel,depth+1,entries,bytes)||
       !identityMatches(full,true,e.identity)||
       !metadata(next.h,attrsAfter,securityAfter)||
       attrsAfter!=e.attributes||securityAfter!=e.securitySha256){
      valid=false;break;
    }
   }else{
    if(!hashFile(full,e,bytes)){
     valid=false;break;
    }
    entries.push_back(e);
   }
  }while(FindNextFileW(find,&found));
  const DWORD end=GetLastError();
  FindClose(find);
  if(!valid||end!=ERROR_NO_MORE_FILES)return false;
 }
 BY_HANDLE_FILE_INFORMATION after={};
 if(!GetFileInformationByHandle(handle.h,&after)||
    (after.dwFileAttributes&(FILE_ATTRIBUTE_DIRECTORY|
                             FILE_ATTRIBUTE_REPARSE_POINT))!=
      FILE_ATTRIBUTE_DIRECTORY||
    id(handle.h)!=dirId||
    !identityMatches(dir,true,dirId))return false;
 DWORD dirAttributesAfter=0;
 std::string dirSecurityAfter;
 if(!metadata(handle.h,dirAttributesAfter,dirSecurityAfter)||
    dirAttributes!=dirAttributesAfter||
    dirSecurity!=dirSecurityAfter)return false;
 return true;
}
bool markerOk(const std::wstring& root){
 Entry marker;
 DWORD bytes=0;
 const std::wstring full=join(root,
    L"VCP-D01-READONLY-DISPOSABLE.marker");
 if(!hashFile(full,marker,bytes))return false;
 // Hash of exact marker is independently compared to known literal by CNG.
 Cng digest;
 if(!digest.start())return false;
 const char* literal="VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY\n";
 const ULONG n=static_cast<ULONG>(lstrlenA(literal));
 if(bytes!=n)return false;
 if(BCryptHashData(digest.hash,
     reinterpret_cast<PUCHAR>(const_cast<char*>(literal)),n,0)<0)
    return false;
 BYTE hash[32]={};
 if(BCryptFinishHash(digest.hash,hash,32,0)<0)return false;
 std::ostringstream expected;
 expected<<std::hex<<std::setfill('0');
 for(BYTE b:hash)expected<<std::setw(2)<<static_cast<unsigned>(b);
 return marker.digest==expected.str();
}
int wmain(int argc,wchar_t* argv[]){
 if(argc!=9||std::wstring(argv[1])!=L"--scratch-root"||
    std::wstring(argv[3])!=L"--variant"||
    std::wstring(argv[5])!=L"--root-id"||
    std::wstring(argv[7])!=L"--project-id")return 2;
 const std::wstring root(argv[2]),variant(argv[4]);
 const std::wstring rootId(argv[6]),projectId(argv[8]);
 if(!trustedRoot(root)||!hex24(rootId)||!hex24(projectId)||
   !(variant==L"with-manifest"||variant==L"without-manifest")||
   !markerOk(root))return 4;
 const std::wstring project=join(root,variant);
 if(!identityMatches(root,true,ascii(rootId))||
    !identityMatches(project,true,ascii(projectId)))return 5;
 Handle rootHandle=openPath(root,true),projectHandle=openPath(project,true);
 DWORD rootAttributes=0,projectAttributes=0;
 std::string rootSecurity,projectSecurity;
 if(!rootHandle.ok()||!projectHandle.ok()||
    !metadata(rootHandle.h,rootAttributes,rootSecurity)||
    !metadata(projectHandle.h,projectAttributes,projectSecurity))
   return 5;
 DWORD totalBytes=0;
 std::vector<Entry> entries;
 DWORD rootFinalAttributes=0,projectFinalAttributes=0;
 std::string rootFinalSecurity,projectFinalSecurity;
 if(!walk(project,"",0,entries,totalBytes)||
    !identityMatches(root,true,ascii(rootId))||
    !identityMatches(project,true,ascii(projectId))||
    !metadata(rootHandle.h,rootFinalAttributes,rootFinalSecurity)||
    !metadata(projectHandle.h,projectFinalAttributes,projectFinalSecurity)||
    rootAttributes!=rootFinalAttributes||
    projectAttributes!=projectFinalAttributes||
    rootSecurity!=rootFinalSecurity||
    projectSecurity!=projectFinalSecurity)return 5;
 std::sort(entries.begin(),entries.end(),
  [](const Entry& a,const Entry& b){return a.relative<b.relative;});
 // Exact, unescaped ASCII-only names are guaranteed by simpleName().
 std::cout<<"{\"kind\":\"D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V2\","
  <<"\"status\":\"NO_GO\","
  <<"\"variant\":\""<<(variant==L"with-manifest"?
    "with-manifest":"without-manifest")<<"\","
  <<"\"rootIdentity\":\""<<ascii(rootId)<<"\","
  <<"\"projectIdentity\":\""<<ascii(projectId)<<"\","
  <<"\"rootAttributes\":"<<rootAttributes<<","
  <<"\"projectAttributes\":"<<projectAttributes<<","
  <<"\"rootSecuritySha256\":\""<<rootSecurity<<"\","
  <<"\"projectSecuritySha256\":\""<<projectSecurity<<"\","
  <<"\"entries\":[";
 for(size_t i=0;i<entries.size();i++){
  if(i)std::cout<<",";
  const Entry& e=entries[i];
  std::cout<<"{\"path\":\""<<e.relative<<"\","
    <<"\"type\":\""<<e.type<<"\","
    <<"\"identity\":\""<<e.identity<<"\","
    <<"\"attributes\":"<<e.attributes<<","
    <<"\"securitySha256\":\""<<e.securitySha256<<"\","
    <<"\"sha256\":";
  if(e.type=="file")std::cout<<"\""<<e.digest<<"\"";
  else std::cout<<"null";
  std::cout<<",\"size\":"<<e.size<<"}";
 }
 std::cout<<"],\"entryCount\":"<<entries.size()
  <<",\"fileBytesHashed\":"<<totalBytes
  <<",\"maxEntries\":512,\"maxDepth\":10,"
  <<"\"maxSingleFileBytes\":131072,\"maxTotalFileBytes\":2097152,"
  <<"\"readOnly\":true,\"sharesDelete\":true,"
  <<"\"reparseEntriesRejected\":true,\"hardlinkedFilesRejected\":true,"
  <<"\"alternateDataStreamsRejected\":true,"
  <<"\"ownerGroupDaclFingerprintMeasured\":true,"
  <<"\"namespaceSnapshotAtomic\":false,"
  <<"\"publishedOldCliExecutionProven\":false,"
  <<"\"WindowsNamespaceDurabilityProven\":false,"
  <<"\"managedMutationAuthorized\":false,\"d01Approved\":false}\n";
 return 3;
}
