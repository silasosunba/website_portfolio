import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// CMS content is fetched with no-store on every request; no R2/ISR cache is needed.
export default defineCloudflareConfig();
