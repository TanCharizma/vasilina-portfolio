export function visualDraftStatus({status, dirty, connected, needsPublish}) {
  if (status.state === 'error' || status.state === 'busy') {
    return {state:status.state, text:status.text};
  }
  if (dirty) return {state:'unsaved', text:'Unsaved changes'};
  if (!connected) return {state:'local', text:'Saved on this device'};
  if (needsPublish) return {state:'unpublished', text:'Draft saved · Not published'};
  return {state:'published', text:'Website up to date'};
}
