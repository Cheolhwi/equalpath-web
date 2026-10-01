import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, MessageCircle } from 'lucide-react';
import { DISCOVERY_PREFERENCES, reviewTopicEvidence, reviewConcerns } from '../shared/review-profile.mjs';
import './review-evidence.css';
import SelectMenu from './SelectMenu.jsx';
import { requestAPI } from './api.js';

// A mixed review counts on both sides, so the parts can add up to more than the total.
const balance = ({ reviewCount, positiveCount, negativeCount }) => {
  const parts = [`${positiveCount} positive`, `${negativeCount} ${negativeCount === 1 ? 'raises' : 'raise'} a concern`];
  const neutral = reviewCount - positiveCount - negativeCount;
  if (neutral > 0) parts.push(`${neutral} neutral`);
  if (neutral < 0) parts.push('some say both');
  return parts.join(' · ');
};
const dateLabel = date => date ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')) : 'Date not provided';
export function ReviewQuote({ review, topic }) {
  const quote = review.passages?.[topic] ?? review.text;
  return <article className="review-quote">
    <p className="review-quote-meta"><strong>Parent review</strong><span>{dateLabel(review.date)}</span></p>
    <blockquote>{quote}</blockquote>
  </article>;
}
export default function ReviewEvidence({ p, onAsk }) {
  const [topic,setTopic]=useState('caring_teachers');
  const [expanded,setExpanded]=useState(false);
  const [opened,setOpened]=useState(false);
  const [loaded,setLoaded]=useState(null);
  const [failed,setFailed]=useState(false);
  const [retry,setRetry]=useState(0);
  const profile=loaded?.id===p.id ? loaded.profile : p.reviewProfile;
  useEffect(()=>{
    if(!opened || !profile?.deferred)return;
    const controller=new AbortController();
    let current=true;
    setFailed(false);
    requestAPI({action:'reviews',mode:p.mode,careType:p.careType,id:p.id,version:p.version},
      {signal:controller.signal,timeoutMs:15000})
      .then(response=>{if(current)setLoaded({id:p.id,profile:response.reviewProfile});})
      .catch(()=>{if(current)setFailed(true);});
    return ()=>{current=false;controller.abort();};
  },[opened,profile?.deferred,p.id,p.mode,p.careType,p.version,retry]);
  if(!profile)return <details className="centre-reviews extra-details"><summary><MessageCircle size={18}/>Parent reviews<ChevronDown size={16}/></summary><p>No reviews are available for this centre yet.</p></details>;
  const heading=<summary><MessageCircle size={18} aria-hidden="true"/><span>Parent reviews<small>{profile.sampleCount.toLocaleString()} {profile.sampleCount === 1 ? "review" : "reviews"}</small></span><ChevronDown size={16} aria-hidden="true"/></summary>;
  const toggle=e=>setOpened(e.currentTarget.open);
  if(profile.deferred)return <details className="centre-reviews extra-details" open={opened} onToggle={toggle}>
    {heading}<div className="review-evidence-body" aria-busy={!failed}>
      <p role="status">{failed?'Reviews could not load. Please try again.':'Loading parent reviews…'}</p>
      {failed&&<button className="secondary" type="button" onClick={()=>setRetry(n=>n+1)}>Try again</button>}
    </div>
  </details>;
  const reviewedProvider={...p,reviewProfile:profile};
  const evidence=reviewTopicEvidence(reviewedProvider,topic);
  const selected=DISCOVERY_PREFERENCES.find(t=>t.id===topic);
  const examples=(profile.excerpts??[]).filter(e=>e.topics.includes(topic)).sort((a,b)=>(b.date??'').localeCompare(a.date??''));
  // Lead with both an observed concern and a positive experience when both exist.
  const representative=[examples.find(e=>['negative','mixed'].includes(e.sentiments[topic])), examples.find(e=>e.sentiments[topic]==='positive')].filter(Boolean);
  const ordered=[...new Map([...representative,...examples].map(e=>[e.id,e])).values()];
  const concern=reviewConcerns(reviewedProvider).find(t=>t.id===topic);
  return <details className="centre-reviews extra-details" open={opened} onToggle={toggle}>
    {heading}
    <div className="review-evidence-body">
      <p className="review-scope">Parents’ experiences can help you choose what to ask. They do not confirm a place for your child.</p>
      <div className="review-topic-select"><SelectMenu label="Read about" value={topic} options={DISCOVERY_PREFERENCES.map(t=>({value:t.id,label:t.label}))} onChange={value=>{setTopic(value);setExpanded(false);}}/></div>
      <div className="review-topic-summary" role="status"><strong>{evidence.reviewCount ? `${evidence.reviewCount} ${evidence.reviewCount === 1 ? 'review mentions' : 'reviews mention'} ${selected.label.toLowerCase()}` : `No reviews mention ${selected.label.toLowerCase()} yet`}</strong>{evidence.reviewCount > 0 && <span>{balance(evidence)} · {evidence.recentCount} in the past year</span>}{evidence.reviewCount > 0 && evidence.recentCount<2&&<span>Too few recent reviews to judge this.</span>}</div>
      {ordered.slice(0,expanded?ordered.length:2).map(review=><ReviewQuote key={review.id} review={review} topic={topic}/>)}
      {!ordered.length&&evidence.reviewCount>0&&<p>No quotes about this topic yet.</p>}
      {ordered.length>2&&<button type="button" className="text-link" onClick={()=>setExpanded(!expanded)}>{expanded?'Show fewer reviews':'Read more reviews'}<ChevronDown size={16}/></button>}
      {concern&&onAsk&&<div className="review-ask"><p>{concern.recentNegative} recent reviews raise a concern about this.</p><button className="secondary" type="button" onClick={()=>onAsk(topic,profile)}>Ask the centre about this<ArrowRight size={16}/></button></div>}
    </div>
  </details>;
}
