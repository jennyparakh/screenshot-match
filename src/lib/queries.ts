import { queryOptions } from '@tanstack/react-query';
import { listItems } from './items.functions';
import type { Item } from './items';
export const itemsQuery=queryOptions({queryKey:['items'],queryFn:async()=>await listItems() as Item[],staleTime:30000});
