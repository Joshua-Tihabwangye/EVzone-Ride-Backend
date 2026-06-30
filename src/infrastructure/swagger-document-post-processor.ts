import type { OpenAPIObject } from '@nestjs/swagger';
import { ROUTE_OWNERSHIP_REGISTRY } from './route-ownership.registry';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];
type PathsObject = NonNullable<OpenAPIObject['paths']>;

function matchRouteOwner(path: string) {
  return ROUTE_OWNERSHIP_REGISTRY.find((owner) => {
    if (path.startsWith(owner.canonicalBase)) return true;
    return owner.compatibilityBases?.some((base) => path.startsWith(base)) ?? false;
  });
}

function isCompatibilityPath(path: string, owner?: (typeof ROUTE_OWNERSHIP_REGISTRY)[number]) {
  if (!owner) return false;
  return owner.compatibilityBases?.some((base) => path.startsWith(base)) ?? false;
}

export function enhanceSwaggerDocument(document: OpenAPIObject): OpenAPIObject {
  const paths: PathsObject = {};

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem) {
      paths[path] = pathItem as PathsObject[string];
      continue;
    }

    const owner = matchRouteOwner(path);
    const compatibility = isCompatibilityPath(path, owner);

    paths[path] = { ...pathItem };

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method as HttpMethod];
      if (!operation) continue;

      const enhancedOperation: Record<string, unknown> = {
        ...operation,
        deprecated: compatibility ? true : operation.deprecated,
        'x-audience': owner?.audience,
        'x-owner-module': owner?.ownerModule,
        'x-lifecycle': owner?.lifecycle,
        'x-route-type': compatibility ? 'compatibility' : 'canonical',
      };
      paths[path]![method as HttpMethod] = enhancedOperation as unknown as PathsObject[string][HttpMethod];
    }
  }

  const enhanced = {
    ...document,
    paths,
  } as OpenAPIObject & Record<string, unknown>;
  enhanced['x-route-ownership-version'] = '1.0';
  return enhanced;
}
