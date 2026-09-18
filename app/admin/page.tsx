import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminDashboard } from '@/components/AdminDashboard';
export const dynamic='force-dynamic';
export default async function Admin(){const db=await createSupabaseServerClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect('/login');const {data:admin}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(!admin)redirect('/');return <div className="pageWidth standalone"><div className="pageIntro adminIntro"><span className="eyebrow">CONTROL CENTER</span><h1>Admin</h1><p>Audience intelligence, catalog health, source reliability and synchronization operations.</p></div><AdminDashboard/></div>}
