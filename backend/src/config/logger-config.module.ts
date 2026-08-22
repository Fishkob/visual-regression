import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from '@config/app-config.module';
import { AppConfigService } from '@config/app-config.service';
import type { Options } from 'pino-http';
import * as path from 'path';
import * as pino from 'pino';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService) => {
        const env = appConfig.app.env;
        const isProd = env === 'production';
        const isTest = env === 'test';

        const pinoHttpConfig: Options = {
          level: isTest ? 'silent' : appConfig.logging.level,

          // The LoggingInterceptor is the single HTTP observability owner (trace
          // span + one request log line); pino-http only supplies the logger.
          autoLogging: false,

          stream:
            !isProd && !isTest
              ? pino.multistream([
                  {
                    stream: pino.transport({
                      target: 'pino-pretty',
                      options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        singleLine: false,
                        levelFirst: true,
                        ignore: 'pid,hostname,req,res,responseTime',
                        messageFormat: '{msg}',
                        errorLikeObjectKeys: ['err', 'error', 'trace'],
                        errorProps: 'type,message,stack',
                      },
                    }),
                  },
                  {
                    stream: pino.destination({
                      dest: path.join(process.cwd(), 'logs/app.log'),
                      mkdir: true,
                      sync: false,
                    }),
                  },
                ])
              : undefined,

          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie'],
            censor: '[REDACTED]',
          },
        };

        return { pinoHttp: pinoHttpConfig };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggerConfigModule {}
