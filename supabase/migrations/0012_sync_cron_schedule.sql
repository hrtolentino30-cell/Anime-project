select cron.schedule('anime-sync-scanner','*/2 * * * *',$$select public.invoke_sync_edge('scanner');$$);
select cron.schedule('anime-sync-worker','* * * * *',$$select public.invoke_sync_edge('worker');$$);
select cron.schedule('anime-sync-source-verifier','17 */6 * * *',$$select public.invoke_sync_edge('verify-sources');$$);
