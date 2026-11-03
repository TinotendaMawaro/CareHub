require('dotenv').config({path:'.env.local'});
const {createClient}=require('@supabase/supabase-js');
(async()=>{const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const email='smoke-office@carehub-test.invalid';
const act=process.argv[2];
if(act==='create'){const {data,error}=await a.auth.admin.createUser({email,password:'Smoke-Test-9x!',email_confirm:true});if(error)throw error;
await a.from('profiles').insert({id:data.user.id,email,first_name:'Smoke',last_name:'Test',role:'admin'});console.log('temp user created')}
else{const l=await a.auth.admin.listUsers({perPage:200});const u=l.data.users.find(x=>x.email===email);if(u){await a.from('legal_acceptances').delete().eq('profile_id',u.id);await a.auth.admin.deleteUser(u.id);console.log('temp user deleted')}else console.log('none')}})();
