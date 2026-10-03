import {
  configureRegistry,
  distrustPublisher,
  fetchRegistryPackage,
  inspectRegistryPackage,
  packRegistryPackage,
  trustRegistryPackage
} from "../core/registry.js";

export async function registryCommand(args, options, root) {
  const [subcommand, target] = args;

  switch (subcommand) {
    case "use": {
      if (!target) throw new Error("registry use needs an HTTPS URL or local path");
      const value = configureRegistry(root, target);
      process.stdout.write(`Registry set to ${value}\n`);
      return 0;
    }

    case "inspect": {
      if (!target) throw new Error("registry inspect needs namespace/name@version");
      const info = await inspectRegistryPackage(root, target, { registry: options.registry });
      process.stdout.write(`${info.name}@${info.version}\n`);
      process.stdout.write(`publisher: ${info.publisher}\n`);
      process.stdout.write(`fingerprint: ${info.fingerprint}\n`);
      process.stdout.write(`artifact: ${info.artifactHash}\n`);
      process.stdout.write(`signature: ${info.signatureValid ? "valid" : "invalid"}\n`);
      if (info.summary) process.stdout.write(`summary: ${info.summary}\n`);
      process.stdout.write("files:\n");
      for (const file of info.files) {
        process.stdout.write(`  ${file.path}  ${file.sha256}  ${file.bytes} bytes\n`);
      }
      return 0;
    }

    case "trust": {
      if (!target) throw new Error("registry trust needs namespace/name@version");
      const result = await trustRegistryPackage(root, target, {
        registry: options.registry,
        fingerprint: options.fingerprint
      });
      process.stdout.write(`Trusted ${result.publisher} at ${result.fingerprint}\n`);
      return 0;
    }

    case "distrust": {
      if (!target) throw new Error("registry distrust needs a publisher id");
      const result = distrustPublisher(root, target);
      process.stdout.write(`Revoked ${target} (${result.fingerprint}). Existing pinned lock entries were not rewritten.\n`);
      return 0;
    }

    case "fetch": {
      if (!target) throw new Error("registry fetch needs namespace/name@version");
      const result = await fetchRegistryPackage(root, target, {
        registry: options.registry,
        offline: Boolean(options.offline)
      });
      process.stdout.write(`Cached ${result.name}@${result.version}\n`);
      process.stdout.write(`publisher: ${result.publisher}\n`);
      process.stdout.write(`artifact: ${result.artifactHash}\n`);
      process.stdout.write(`source: ${result.source}\n`);
      return 0;
    }

    case "pack": {
      if (!target) throw new Error("registry pack needs a local trait directory");
      const result = packRegistryPackage(target, {
        publisher: options.publisher,
        keyPath: options.key,
        outDir: options.out
      });
      process.stdout.write(`Packed ${result.name}@${result.version}\n`);
      process.stdout.write(`publisher: ${result.publisher}\n`);
      process.stdout.write(`fingerprint: ${result.fingerprint}\n`);
      process.stdout.write(`artifact: ${result.artifactHash}\n`);
      process.stdout.write(`descriptor: ${result.descriptorPath}\n`);
      return 0;
    }

    default:
      throw new Error("registry command must be one of: use, inspect, trust, distrust, fetch, pack");
  }
}
