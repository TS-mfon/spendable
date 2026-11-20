export class ApiError extends Error {
 constructor(readonly code:string,message:string,readonly status:number){super(message);this.name='ApiError';}
}
export async function requestApi<T>(path:string,options:{method?:string;body?:unknown;signal?:AbortSignal}={},fetcher:typeof fetch=fetch):Promise<T>{
 const response=await fetcher(path,{method:options.method??'GET',credentials:'same-origin',headers:options.body===undefined?{}:{'Content-Type':'application/json'},...(options.body===undefined?{}:{body:JSON.stringify(options.body)}),signal:options.signal});
 let payload:unknown;
 try{payload=await response.json();}catch{throw new ApiError('INVALID_RESPONSE','The server response could not be read. Try again.',response.status);}
 if(!payload||typeof payload!=='object'||!('success' in payload))throw new ApiError('INVALID_RESPONSE','The server returned an invalid response. Try again.',response.status);
 const result=payload as {success:unknown;data?:T;error?:{code?:unknown;message?:unknown}};
 if(!response.ok||result.success!==true)throw new ApiError(typeof result.error?.code==='string'?result.error.code:'REQUEST_FAILED',typeof result.error?.message==='string'?result.error.message:'The request failed. Try again.',response.status);
 if(!Object.hasOwn(result,'data'))throw new ApiError('INVALID_RESPONSE','The server returned an invalid response. Try again.',response.status);
 return result.data as T;
}
