export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NODE_ENV==='development'){
    const {allIds,mutate,cleanup}=await import('./lib/server/store');
    const {evaluate}=await import('./lib/journey');
    // Local development scheduler. Hosted deployments use pg_cron instead.
    const globalState=globalThis as typeof globalThis & {sjTimer?:ReturnType<typeof setInterval>};
    if(!globalState.sjTimer){globalState.sjTimer=setInterval(async()=>{try{for(const id of await allIds())await mutate(id,j=>evaluate(j,Date.now()));await cleanup();}catch{ /* API reports storage failures to the UI. */ }},5000);globalState.sjTimer.unref();}
  }
}
