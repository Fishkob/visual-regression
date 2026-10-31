import { Injectable } from '@nestjs/common';
import { BaseRepository } from '@/prisma/base.repository';

// Share links carry a project NAME instead of a foreign key (the access module
// resolves them by token, then by name). That makes them outlive their project:
// deleting "acme" and later creating a new "acme" would re-validate every old,
// unexpired token against the new project's data, so a URL pasted into a ticket
// or a Slack thread would start serving someone else's evidence.
//
// The delete therefore rides the project-deletion transaction (this repository
// extends BaseRepository, so it resolves to the ambient transaction). It lives
// in core next to the deletion service that owns that transaction rather than in
// the access module, which already depends on core.
@Injectable()
export class ProjectShareLinkRepository extends BaseRepository {
  async deleteForProjectName(projectName: string): Promise<void> {
    this.assertWritable();
    await this.client.shareLink.deleteMany({ where: { projectName } });
  }
}
