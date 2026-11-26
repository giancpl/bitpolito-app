import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {resourceSchema} from '../../shared/contracts';
import {hub} from '../lib/hub';
import {Button,Notice} from './ui';
import {useConfirm} from './Feedback';
type Row=Record<string,unknown>;
export function ResourceImport(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);const confirm=useConfirm(),client=useQueryClient();
 return <details className="resource-import"><summary>Import an existing catalogue</summary><p className="small muted">Choose a BitPolito resource export. Nothing is published until you confirm.</p>
 <input aria-label="Resource archive" type="file" accept="application/json,.json" onChange={event=>void(async()=>{try{setError('');const file=event.target.files?.[0];if(!file)return;if(file.size>500000)throw Error('Choose an archive smaller than 500 KB.');const archive=JSON.parse(await file.text());if(archive.format!=='bitpolito.resources.v1'||!Array.isArray(archive.resources)||archive.resources.length>500)throw Error('Choose a BitPolito resource export.');const validated=archive.resources.map((r:Row)=>{const {id,icon,...fields}=r;return {...resourceSchema.parse(fields),id:String(id),icon:typeof icon==='string'&&/^[a-z0-9-]+\.svg$/.test(icon)?icon:'icon-linkedin.svg'};});setRows(validated);}catch(e){setError((e as Error).message);}})()}/>
 {rows.length>0&&<><ul className="small">{rows.map(r=><li key={String(r.id)}>{String(r.title)} · {String(r.status)}</li>)}</ul><Button busy={busy} onClick={()=>void(async()=>{if(!await confirm({title:`Publish ${rows.length} resources?`,description:'The current members of your encrypted team will receive this catalogue. Matching resource IDs will be updated.',action:'Publish catalogue'}))return;setBusy(true);setError('');try{for(const row of rows)await hub.command('saveResource',row);setRows([]);await client.invalidateQueries({queryKey:['resources']});}catch(e){setError((e as Error).message);}finally{setBusy(false);}})()}>Publish catalogue</Button></>}
 {error&&<Notice>{error}</Notice>}</details>;
}
