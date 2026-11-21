import { z } from 'zod';
import earbuds from '@/assets/earbuds.asset.json';
import bottle from '@/assets/bottle.asset.json';
import keys from '@/assets/keys.asset.json';
import sweatshirt from '@/assets/sweatshirt.asset.json';
export const categories = ['electronics','clothing','accessories','keys','bags','documents','other'] as const;
export const itemSchema = z.object({title:z.string().trim().min(2).max(100),kind:z.enum(['lost','found']),category:z.enum(categories),description:z.string().trim().min(5).max(1500),location:z.string().trim().min(2).max(120),event_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v)) && v<=new Date().toISOString().slice(0,10),'Choose today or an earlier date'),image_path:z.string().max(500).nullable()});
export const requestSchema = z.object({item_id:z.string().uuid(),message:z.string().trim().min(5).max(1000),contact:z.string().trim().min(3).max(255)});
export type Item = z.infer<typeof itemSchema> & {id:string;user_id:string;resolved:boolean;created_at:string;photo?:string};
export const samples:Record<string,string> = {'sample:earbuds':earbuds.url,'sample:bottle':bottle.url,'sample:keys':keys.url,'sample:sweatshirt':sweatshirt.url};
const words=(s:string)=>new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!['the','and','with','sample','listing','found','lost','missing','their','from'].includes(w)));
export function matchScore(a:Item,b:Item){
 if(a.kind===b.kind||a.resolved||b.resolved||a.category!==b.category)return 0;
 const aw=words(a.title+' '+a.description),bw=words(b.title+' '+b.description);
 const shared=[...aw].filter(w=>bw.has(w)).length;
 const overlap=shared/Math.max(1,Math.min(aw.size,bw.size));
 const location=a.location.toLowerCase()===b.location.toLowerCase()?15:0;
 const days=Math.abs(Date.parse(a.event_date)-Date.parse(b.event_date))/86400000;
 return Math.min(99,Math.round(30+overlap*45+location+Math.max(0,10-days*2)));
}
export function matchesFor(item:Item,items:Item[]){return items.map(other=>({item:other,score:matchScore(item,other)})).filter(m=>m.score>=50).sort((a,b)=>b.score-a.score).slice(0,4)}
export function dateLabel(date:string){return new Date(date+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}
