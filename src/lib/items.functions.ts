import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { itemSchema,requestSchema } from './items';
import type { Database } from '@/integrations/supabase/types';
export const listItems=createServerFn({method:'GET'}).handler(async()=>{
 const key=process.env['SUPABASE_PUBLISHABLE_KEY'];const url=process.env['SUPABASE_URL'];if(!key||!url)throw new Error('Listings are temporarily unavailable');
 const db=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{const headers=new Headers(init?.headers);if(headers.get('Authorization')===`Bearer ${key}`)headers.delete('Authorization');headers.set('apikey',key);return fetch(input,{...init,headers})}}});
 const {data,error}=await db.from('items').select('*').eq('resolved',false).order('created_at',{ascending:false}).limit(500);if(error)throw new Error(error.message);return data;
});
export const createItem=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>itemSchema.parse(v)).handler(async({data,context})=>{
 if(data.image_path&&!data.image_path.startsWith(context.userId+'/'))throw new Error('Invalid photo');
 const {data:item,error}=await context.supabase.from('items').insert({...data,user_id:context.userId}).select().single();if(error)throw new Error(error.message);return item;
});
export const sendRequest=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>requestSchema.parse(v)).handler(async({data,context})=>{
 const {data:item}=await context.supabase.from('items').select('user_id,image_path').eq('id',data.item_id).eq('resolved',false).single();if(!item)throw new Error('This item is no longer available');if(item.image_path?.startsWith('sample:'))throw new Error('This is a sample listing');
 const {error}=await context.supabase.from('requests').insert({...data,sender_id:context.userId,recipient_id:item.user_id});if(error)throw new Error(error.code==='23505'?'You already sent a request for this item':error.message);return true;
});
export const resolveItem=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.string().uuid().parse(v)).handler(async({data,context})=>{const {data:rows,error}=await context.supabase.from('items').update({resolved:true}).eq('id',data).eq('user_id',context.userId).select('id');if(error||!rows?.length)throw new Error('Only the reporter can resolve this item');return true});
export const improveMatches=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.string().uuid().parse(v)).handler(async({data,context})=>{
 const {data:source}=await context.supabase.from('items').select('*').eq('id',data).single();if(!source)throw new Error('Item not found');
 const {data:candidates}=await context.supabase.from('items').select('id,title,description,location,event_date').eq('category',source.category).neq('kind',source.kind).eq('resolved',false).limit(20);
 if(!candidates?.length)return [];
 const {rankMatches}=await import('./ai/matching.server');return rankMatches(source,candidates);
});
// Open-listing photos are signed server-side after confirming the listing is open and owned by the uploader; storage itself stays owner-only.
export const openListingPhotoUrl=createServerFn({method:'POST'}).inputValidator((v:unknown)=>z.string().max(500).regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/).parse(v)).handler(async({data})=>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const owner=data.split('/')[0]!;
 const {data:item}=await supabaseAdmin.from('items').select('id').eq('image_path',data).eq('resolved',false).eq('user_id',owner).limit(1).maybeSingle();
 if(!item)return null;
 const {data:signed}=await supabaseAdmin.storage.from('item-photos').createSignedUrl(data,3600);return signed?.signedUrl??null;
});
