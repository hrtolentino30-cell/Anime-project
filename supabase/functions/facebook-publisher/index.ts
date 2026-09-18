Deno.serve(() => Response.json({error:'Legacy publisher retired. Publishing is handled exclusively by the durable Facebook upload worker.'},{status:410}));
