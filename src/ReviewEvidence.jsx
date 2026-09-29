import { useState } from 'react';
import { ArrowRight, ChevronDown, MessageCircle } from 'lucide-react';
import { DISCOVERY_PREFERENCES, reviewTopicEvidence, reviewConcerns } from '../shared/review-profile.mjs';
import './review-evidence.css';
import SelectMenu from './SelectMenu.jsx';

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
  const profile=p.reviewProfile;
  if(!profile)return <details className="centre-reviews extra-details"><summary><MessageCircle size={18}/>Parent reviews<ChevronDown size={16}/></summary><p>No review sample is available for this centre yet.</p></details>;
  const evidence=reviewTopicEvidence(p,topic);
  const selected=DISCOVERY_PREFERENCES.find(t=>t.id===topic);
  const examples=profile.excerpts.filter(e=>e.topics.includes(topic)).sort((a,b)=>(b.date??'').localeCompare(a.date??''));
  // Lead with both an observed concern and a positive experience when both exist.
  const representative=[examples.find(e=>['negative','mixed'].includes(e.sentiments[topic])), examples.find(e=>e.sentiments[topic]==='positive')].filter(Boolean);
  const ordered=[...new Map([...representative,...examples].map(e=>[e.id,e])).values()];
  const concern=reviewConcerns(p).find(t=>t.id===topic);
  return <details className="centre-reviews extra-details">
    <summary><MessageCircle size={18} aria-hidden="true"/><span>Parent reviews<small>{profile.sampleCount} reviews in this sample</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
    <div className="review-evidence-body">
      <p className="review-scope">Parents’ experiences can help you choose what to ask. They do not confirm a place for your child.</p>
      <div className="review-topic-select"><SelectMenu label="Read about" value={topic} options={DISCOVERY_PREFERENCES.map(t=>({value:t.id,label:t.label}))} onChange={value=>{setTopic(value);setExpanded(false);}}/></div>
      <div className="review-topic-summary" role="status"><strong>{selected.label}</strong><span>{evidence.reviewCount} reviews mention this · {evidence.recentCount} in the past 12 months</span><span>{evidence.reviewCount ? `${evidence.positiveCount} positive · ${evidence.negativeCount} with concerns. Some mention both.` : 'No reviews about this topic in the sample.'}</span>{evidence.recentCount<2&&<span>Too few recent reviews to judge this topic.</span>}</div>
      {ordered.slice(0,expanded?ordered.length:2).map(review=><ReviewQuote key={review.id} review={review} topic={topic}/>)}
      {!ordered.length&&<p>No review passage about this topic is available in this sample.</p>}
      {ordered.length>2&&<button type="button" className="text-link" onClick={()=>setExpanded(!expanded)}>{expanded?'Show fewer reviews':'Read more reviews'}<ChevronDown size={16}/></button>}
      {concern&&onAsk&&<div className="review-ask"><p>{concern.recentNegative} recent reviews raise a concern about this.</p><button className="secondary" type="button" onClick={()=>onAsk(topic)}>Ask the centre about this<ArrowRight size={16}/></button></div>}
    </div>
  </details>;
}
