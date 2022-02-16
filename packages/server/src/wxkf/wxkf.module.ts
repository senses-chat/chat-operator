import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { StorageModule } from '@senses-chat/operator-database';
import { EventSourcingModule } from '@senses-chat/operator-events';

import { ConfigModule } from 'src/modules';

import { CommandHandlers } from './commands';
import { EventHandlers } from './events';
import { QueryHandlers } from './queries';
import { WxkfSagas } from './sagas';
import { WxkfController } from './wxkf.controller';
import { WxkfServiceRegistry } from './wxkf.registry';

@Module({
  imports: [
    CqrsModule,
    EventSourcingModule,
    ConfigModule,
    StorageModule.register(),
  ],
  controllers: [WxkfController],
  providers: [
    WxkfServiceRegistry,
    WxkfSagas,
    ...CommandHandlers,
    ...EventHandlers,
    ...QueryHandlers,
  ],
  exports: [WxkfServiceRegistry],
})
export class WxkfModule {}
