import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminDashboard } from '@/components/AdminDashboard';
export const dynamic='force-dynamic';
export default async function Admin(){const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(!admin)redirect('/');return <div className="pageWidth standalone"><div className="pageIntro"><span className="eyebrow">SOURCE OPERATIONS</span><h1>Admin dashboard</h1><p>Observe the queue, inspect parser output, and intervene only when synchronization needs attention.</p></div><AdminDashboard/></div>}
