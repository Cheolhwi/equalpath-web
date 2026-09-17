import { MapPin, Building2, Users } from "lucide-react";

// A sequence, not a route estimate: arrival is never inferred from driving time.
export default function CareJourney({ request, centreName }) {
  return <ol className="care-journey" aria-label="Pickup and care times">
    <li><MapPin size={20} aria-hidden="true" /><span>Go to childcare</span><strong>{request.deadline}</strong></li>
    <li><Building2 size={20} aria-hidden="true" /><span>Child care</span><strong>{centreName}</strong></li>
    <li><Users size={20} aria-hidden="true" /><span>Pick up child</span><strong>{request.end}</strong></li>
  </ol>;
}
