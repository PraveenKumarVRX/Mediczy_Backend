import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["100.64.0.0", 10],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  blocked.addSubnet(network, prefix, "ipv4");
export function publicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6)
    return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
  return false;
}
export function publicHttpsUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal") ||
    isIP(url.hostname.replace(/^\[|\]$/g, ""))
  )
    throw new Error("Use a public HTTPS identity-provider URL");
  return url;
}
/** Pin the validated DNS result to the TLS request; no redirects or private-network access. */
export async function publicHttpsJson(
  value,
  { method = "GET", headers = {}, body } = {},
) {
  const url = publicHttpsUrl(value);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((row) => !publicAddress(row.address)))
    throw new Error("Identity-provider host must resolve to public addresses");
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        headers,
        timeout: 15000,
        lookup: (_hostname, options, callback) =>
          options.all
            ? callback(null, addresses)
            : callback(null, addresses[0].address, addresses[0].family),
      },
      (res) => {
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1024 * 1024)
            res.destroy(new Error("Identity-provider response is too large"));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300)
            return reject(new Error("Identity-provider request failed"));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Invalid identity-provider response"));
          }
        });
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Identity-provider request timed out")),
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
