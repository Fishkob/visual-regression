interface FindManyWithCountModel {
  findMany(args?: object): Promise<unknown[]>;
  count(args?: { where?: unknown }): Promise<number>;
}

interface FindManyWithCountArgs {
  where?: unknown;
  select?: unknown;
  include?: unknown;
  skip?: number;
  take?: number;
  orderBy?: unknown;
}

export async function findManyWithCount<T>(
  model: FindManyWithCountModel,
  args: FindManyWithCountArgs,
): Promise<{ data: T[]; total: number }> {
  const [data, total] = await Promise.all([
    model.findMany(args) as Promise<T[]>,
    model.count({ where: args.where }),
  ]);
  return { data, total };
}
