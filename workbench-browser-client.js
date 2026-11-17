(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.ApiWorkbenchBrowserClient=api;
})(typeof globalThis==='undefined'?null:globalThis,function(){
  'use strict';
  function createClient({fetch:fetcher=globalThis.fetch,controlAuth,origin,apiBase}) {
    async function request(path,method='GET',body) {
      const auth=await controlAuth();
      if(!auth?.token) throw Object.assign(new Error('本机后台连接不可用，请通过工作台启动器启动服务'),{definite:true});
      const response=await fetcher(`/api/agent/v1${path}`,{
        method, credentials:'same-origin', cache:'no-store',
        headers:{Authorization:`Bearer ${auth.token}`,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      });
      const json=await response.json();
      if(!response.ok || json?.success===false) throw Object.assign(new Error(json?.error?.message || json?.message || json?.error || `后台请求失败 HTTP ${response.status}`),{
        statusCode:response.status,
        definite:response.status>=400 && response.status<500 && response.status!==408
      });
      return json.task || json;
    }
    return {
      submitTask(envelope) {
        const input=envelope.input || {};
        return request('/tasks','POST',{
          ...envelope,origin:origin(),
          input:{...input,options:{...(input.options || {}),apiBase:apiBase()}}
        });
      },
      getTask:id=>request(`/tasks/${encodeURIComponent(id)}`),
      cancelTask:id=>request(`/tasks/${encodeURIComponent(id)}/cancel`,'POST',{})
    };
  }
  return {createClient};
});
