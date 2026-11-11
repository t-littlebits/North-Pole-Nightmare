import { Link } from 'react-router-dom';
export default function NotFound() {
  return <div className="page narrow"><div className="panel"><h1>Lost in the snow</h1><p>That page does not exist.</p><Link className="btn" to="/">Back to the village</Link></div></div>;
}
