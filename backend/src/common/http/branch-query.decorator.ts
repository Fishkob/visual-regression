import { Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { BranchNameValidationPipe } from '@common/http/pipes/branch-name-validation.pipe';

// One decorator for the `branch` query parameter every branch-scoped
// read/command accepts. The @ApiQuery half keeps the generated SDK/OpenAPI
// contract optional — without it Swagger marks the parameter required and the
// client would force every call site to pass a branch.
//
// It binds the WHOLE query object: the global ValidationPipe String()-coerces a
// single-property query param before our pipe runs, which would turn a repeated
// `?branch=a&branch=b` into the valid-looking name "a,b". The pipe picks
// `branch` out of the object itself.
export function BranchQuery(
  options: { required?: boolean } = {},
): ParameterDecorator {
  const isRequired = options.required ?? false;
  const query = Query(new BranchNameValidationPipe());
  const apiQuery = ApiQuery({
    name: 'branch',
    required: isRequired,
    // Explicit type: without it the generated schema is `{}` on routes that
    // have no query DTO declaring `branch`, and the SDK degrades to `unknown`.
    type: String,
    description:
      'Branch to read or act on (defaults to the project default branch)',
  });
  return (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ) => {
    query(target, propertyKey, parameterIndex);
    // ApiQuery is a method decorator: it reads the descriptor's `.value` to
    // attach the parameter metadata, so hand it the method descriptor instead
    // of the parameter index.
    const descriptor =
      propertyKey === undefined
        ? undefined
        : Object.getOwnPropertyDescriptor(target, propertyKey);
    (
      apiQuery as unknown as (
        target: object,
        propertyKey: string | symbol | undefined,
        descriptor: PropertyDescriptor | undefined,
      ) => void
    )(target, propertyKey, descriptor);
  };
}
