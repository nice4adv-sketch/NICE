'use strict';
const {handler}=require('../server');
module.exports=async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const original=url.searchParams.get('__nice_path');
  const kind=url.searchParams.get('__nice_kind')||'api';
  if(original){
    url.searchParams.delete('__nice_path');
    url.searchParams.delete('__nice_kind');
    req.url=(kind==='private'?'/private-media/':'/api/')+original+url.search;
  }
  return handler(req,res);
};
