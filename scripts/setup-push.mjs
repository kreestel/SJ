import { readFile, writeFile } from 'node:fs/promises';
import webpush from 'web-push';
let contents='';try{contents=await readFile('.env.local','utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
if(/^VAPID_PRIVATE_KEY=\S+/m.test(contents)){
  console.log('Notification keys already exist in .env.local. Keeping them unchanged.');
}else{
  const keys=webpush.generateVAPIDKeys();
  const url=contents.match(/^NEXT_PUBLIC_APP_URL=(.+)$/m)?.[1]?.trim()||'http://localhost:3000';
  contents=contents.replace(/^(NEXT_PUBLIC_VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT)=.*\r?\n?/gm,'');
  contents+=`\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=${url}\n`;
  await writeFile('.env.local',contents);
  console.log('Notification keys saved in .env.local (git-ignored). Copy the three VAPID values to Vercel, then redeploy. Keys were not printed.');
}
