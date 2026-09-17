export default function Loading() {
  return <div className="pageWidth standalone loadingPage" role="status" aria-label="Loading page"><span className="srOnly">Loading anime…</span><div className="loadingHeading" /><div className="browseGrid" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <div className="loadingCard" key={index}><div /><span /></div>)}</div></div>;
}
