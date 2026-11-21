import { describe,it,expect } from 'vitest';
import { matchScore,itemSchema,requestSchema,type Item } from '@/lib/items';
const item:Item={id:'a',user_id:'u',title:'White wireless earbuds',kind:'lost',category:'electronics',description:'White earbuds charging case',location:'Central Library',event_date:'2026-11-19',image_path:null,resolved:false,created_at:'2026-11-19'};
describe('LostLink matching rules',()=>{
 it('matches opposite listings by category, keywords, location and date',()=>expect(matchScore(item,{...item,id:'b',kind:'found'})).toBe(99));
 it('never matches two lost listings',()=>expect(matchScore(item,{...item,id:'b'})).toBe(0));
 it('never matches different categories',()=>expect(matchScore(item,{...item,kind:'found',category:'keys'})).toBe(0));
 it('excludes resolved listings',()=>expect(matchScore(item,{...item,kind:'found',resolved:true})).toBe(0));
 it('supports all seven requested categories',()=>{for(const category of ['electronics','clothing','accessories','keys','bags','documents','other'])expect(itemSchema.safeParse({...item,category}).success).toBe(true)});
 it('requires a private request message and contact',()=>expect(requestSchema.safeParse({item_id:'00000000-0000-0000-0000-000000000001',message:'hello',contact:''}).success).toBe(false));
});
