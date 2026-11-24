import { z } from 'zod';
import { filterSecrets } from '../secret-filter/index.js';

const Ref=z.string().min(1).max(180);
export const OwnView=z.object({statement:z.string().min(1).max(300),sourceRefs:z.array(Ref).min(1).max(8),
 conditions:z.string().min(1).max(200),uncertainty:z.enum(['tentative','supported']),
 counterEvidence:z.array(z.string().min(1).max(200)).max(3).default([])}).strict();
export const RoleDecision=z.object({ownView:OwnView.optional(),roleCandidates:z.array(OwnView).max(2).optional()}).strict();

const safeData=(x:unknown)=>Object.keys(filterSecrets('export',x).redactions).length===0;

function normalizeProposal(v:any){
 if(!v||typeof v!=='object'||Array.isArray(v))return v;
 const cond=Array.isArray(v.conditions)?v.conditions.filter((x:unknown)=>typeof x==='string'&&x.trim()).join('; ').slice(0,200):v.conditions;
 return {...v,conditions:cond};
}
export function roleDecision(answer:any,bundle:any,messageRef?:string){
 const raw={...(answer.ownView!==undefined?{ownView:normalizeProposal(answer.ownView)}:{}),...(answer.roleCandidates!==undefined?{roleCandidates:Array.isArray(answer.roleCandidates)?answer.roleCandidates.map(normalizeProposal):answer.roleCandidates}:{})};
 const decision=RoleDecision.parse(raw);
 if(!Object.keys(decision).length)return {};
 if(bundle?.status!=='ready'||bundle?.self?.subject!=='persona'||!Array.isArray(bundle.sourceRefs))throw Error('Effective role context required');
 const episodeRefs=Array.isArray(bundle.episodicMemories)?bundle.episodicMemories.flatMap((e:any)=>['episode:'+e.id,...(Array.isArray(e.sourceRefs)?e.sourceRefs:[])]):[];
 const allowed=new Set([...bundle.sourceRefs,...episodeRefs,...(messageRef?['message:'+messageRef]:[])]);
 for(const view of [decision.ownView,...(decision.roleCandidates??[])].filter(Boolean))if(!safeData(view)||view!.sourceRefs.some(ref=>!allowed.has(ref)))throw Error('Unknown own-view provenance');
 return decision;
}
