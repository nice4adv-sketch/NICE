'use strict';
/* Storage access only from the backend. Never bundle a service-role/secret key
   into HTML, frontend JS, git, or any VITE_/NEXT_PUBLIC_ env variable. */
let client;
function getClient(){
  if(!client){
    const url=process.env.SUPABASE_URL;
    const secret=process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if(!url||!secret)throw new Error('Supabase storage is not configured (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
    const {createClient}=require('@supabase/supabase-js');
    client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  }
  return client;
}
function bucket(isPrivate){return process.env[isPrivate?'SUPABASE_PRIVATE_BUCKET':'SUPABASE_PUBLIC_BUCKET'] || (isPrivate?'nice-private':'nice-public');}
async function upload(name,buffer,{isPrivate=false,contentType='application/octet-stream',folder}={}){
  const p=`${folder||(isPrivate?'private-media':'uploads')}/${name}`;
  const s=getClient();const b=bucket(isPrivate);
  const {error}=await s.storage.from(b).upload(p,buffer,{contentType,upsert:false,cacheControl:isPrivate?'0':'3600'});
  if(error)throw new Error('storage_upload_failed: '+error.message);
  if(isPrivate)return `/private-media/${name}`;
  return s.storage.from(b).getPublicUrl(p).data.publicUrl;
}
async function downloadPrivate(name){
  const {data,error}=await getClient().storage.from(bucket(true)).download(`private-media/${name}`);
  if(error||!data)return null;
  return {buffer:Buffer.from(await data.arrayBuffer()),contentType:data.type||'application/octet-stream'};
}
async function validateBucketVisibility(){
  const s=getClient();
  const [pub,priv]=await Promise.all([
    s.storage.getBucket(bucket(false)),
    s.storage.getBucket(bucket(true))
  ]);
  if(pub.error || !pub.data)throw new Error('Public Supabase Storage bucket is missing: '+bucket(false));
  if(priv.error || !priv.data)throw new Error('Private Supabase Storage bucket is missing: '+bucket(true));
  if(pub.data.public!==true)throw new Error('The public media bucket must be PUBLIC: '+bucket(false));
  if(priv.data.public!==false)throw new Error('SECURITY: Customer/payment bucket must be PRIVATE: '+bucket(true));
}
module.exports={getClient,upload,downloadPrivate,validateBucketVisibility};
