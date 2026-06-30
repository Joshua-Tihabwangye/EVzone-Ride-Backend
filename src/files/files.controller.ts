import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/interfaces';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import { FilesService } from './files.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Get('storage/status')
  status() {
    return this.service.status();
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @RequireIdempotency()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 15 * 1024 * 1024 })] }),
    )
    file: Express.Multer.File,
    @Query('visibility') visibility: 'PUBLIC' | 'PRIVATE' = 'PRIVATE',
  ) {
    return this.service.upload(user.id, file, visibility);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.get(user, id);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('expiresAt', ParseIntPipe) expiresAt: number,
    @Query('signature') signature: string,
  ): Promise<StreamableFile | { redirectUrl: string }> {
    const result = await this.service.download(user, id, expiresAt, signature);
    if (result.kind === 'redirect') return { redirectUrl: result.redirectUrl };
    return result.stream;
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
