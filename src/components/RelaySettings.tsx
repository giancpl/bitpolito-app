import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {hub} from '../lib/hub';
import {useConfirm} from './Feedback';
import {AsyncForm,Field,Notice} from './ui';
export function RelaySettings(){const query=useQuery({queryKey:['team-relays'],queryFn:()=>hub.command<{relays:string[]}>('relays')}),confirm=useConfirm(),client=useQueryClient();const [saved,setSaved]=useState(false);
 return <details><summary>Team relay connections</summary><p className="small muted">Relays carry encrypted updates. Add new endpoints before retiring the old ones. EU and US defaults share one operator.</p>
  {query.data&&<AsyncForm submitLabel="Update team relays" onSubmit={async form=>{const relays=String(form.get('relays')).split(/\s+/).filter(Boolean);if(!await confirm({title:'Update relay connections?',description:'Current members will learn these endpoints when they synchronize. Keep an existing endpoint during migration.',action:'Publish relay update'}))return;await hub.command('setRelays',{relays});await client.invalidateQueries();setSaved(true);}}><Field label="Relay URLs — one per line"><textarea name="relays" required rows={4} defaultValue={query.data.relays.join('\n')} autoCapitalize="none" autoCorrect="off" spellCheck={false}/></Field></AsyncForm>}
  {query.error&&<Notice>{query.error.message}</Notice>}{saved&&<p role="status">Relay update published. This does not confirm every phone has synchronized.</p>}
 </details>;
}
