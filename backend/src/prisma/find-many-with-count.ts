interface FindManyWithCountModel {
  findMany(args?: object): Promise<unknown[]>;
  count(args?: { where?: object }): Promise<number>;
}

export async function findManyWithCount<T>(
  model: FindManyWithCountModel,
  args: {
    where?: any;
    select?: any;
    include?: any;
    skip?: number;
    take?: number;
    orderBy?: any;
  },
): Promise<{ data: T[]; total: number }> {
  const [data, total] = await Promise.all([
    model.findMany(args) as Promise<T[]>,
    model.count({ where: args.where }),
  ]);
  return { data, total };
}
