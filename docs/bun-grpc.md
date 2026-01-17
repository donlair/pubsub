# Support for node:http2 server and gRPC

In this release of Bun, we added support for our most upvoted feature request: HTTP2 server and gRPC support. Bun has supported the node:http2 client since v1.0.13, but we didn't support the server, until now.

In Bun, node:http2 runs 2.4x faster than in Node v23.

You can use the node:http2 API to create an HTTP2 server.

import { createSecureServer } from "node:http2";
import { readFileSync } from "node:fs";

const server = createSecureServer({
key: readFileSync("privkey.pem"),
cert: readFileSync("cert.pem"),
});

server.on("error", (error) => console.error(error));
server.on("stream", (stream, headers) => {
stream.respond({
":status": 200,
"content-type": "text/html; charset=utf-8",
});
stream.end("<h1>Hello from Bun!</h1>");
});

server.listen(3000);
With HTTP2 support, you can also use gRPC with packages like @grpc/grpc-js.

const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const packageDefinition = protoLoader.loadSync("benchmark.proto", {});
const proto = grpc.loadPackageDefinition(packageDefinition).benchmark;
const fs = require("fs");

function ping(call, callback) {
callback(null, { message: "Hello, World" });
}

function main() {
const server = new grpc.Server();
server.addService(proto.BenchmarkService.service, { ping: ping });
const tls =
!!process.env.TLS &&
(process.env.TLS === "1" || process.env.TLS === "true");
const port = process.env.PORT || 50051;
const host = process.env.HOST || "localhost";
let credentials;
if (tls) {
const ca = fs.readFileSync("./cert.pem");
const key = fs.readFileSync("./key.pem");
const cert = fs.readFileSync("./cert.pem");
credentials = grpc.ServerCredentials.createSsl(ca, [
{ private_key: key, cert_chain: cert },
]);
} else {
credentials = grpc.ServerCredentials.createInsecure();
}
server.bindAsync(`${host}:${port}`, credentials, () => {
console.log(
`Server running at ${tls ? "https" : "http"}://${host}:${port}`,
);
});
}

main();
