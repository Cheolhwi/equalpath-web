import './centre-highlights.css';

export default function CentreHighlights({ highlights }) {
  if (!highlights.length) return null;
  return <div className="centre-highlights" role="list" aria-label="Highlights from parent reviews" title="Highlights from parent reviews">
    {highlights.map(tag => <span className="centre-highlight" role="listitem" key={tag.id} data-topic={tag.id}>{tag.label}</span>)}
  </div>;
}
