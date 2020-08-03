import { Logger } from '@nestjs/common';
import { ConfigService } from 'nestjs-config';
import { Observable, from, zip, interval, Subscription } from 'rxjs';
import { Container } from 'dockerode';
import { Subject } from 'rxjs';
import * as Ops from 'rxjs/operators';

import { DockerService } from 'src/docker';

import { RasaWebhookPayload, RasaResponsePayload, RasaServer, RasaHelperServer } from './models';

export class Rasa {
  private logger: Logger;
  public messageSubject: Subject<RasaWebhookPayload>;
  public subscription: Subscription;

  constructor(private readonly configService: ConfigService, private readonly dockerService: DockerService, public readonly rasaServer: RasaServer) {
    this.logger = new Logger(`${Rasa.name}-${this.rasaServer.name}`);
    this.messageSubject = new Subject();
  }

  public async launch(): Promise<string[]> {
    this.logger.debug(`launching rasa bot ${this.rasaServer.name}`);

    const containerIds = [];
    const rasaBotContainer = await this.createRasaServerContainer(this.rasaServer);
    this.logger.debug(`Rasa Bot ${this.rasaServer.name} container created as ${rasaBotContainer.id.substr(0, 8)}`);
    containerIds.push(rasaBotContainer.id);

    await rasaBotContainer.start();
    this.logger.debug(`Rasa Bot ${this.rasaServer.name} container started`);

    // start action servers
    const actionServers = this.rasaServer.helpers;
    for (const actionServer of actionServers) {
      const actionServerContainer = await this.createRasaHelperServerContainer(actionServer);
      this.logger.debug(`Action Server ${actionServer.name} container created as ${actionServerContainer.id.substr(0, 8)}`);
      containerIds.push(actionServerContainer.id);
      await actionServerContainer.start();
      this.logger.debug(`Action Server ${actionServer.name} container started`);
    }

    return containerIds;
  }

  public responseObservable(): Observable<RasaResponsePayload> {
    return this.messageSubject.pipe(
      Ops.concatMap((payload: RasaWebhookPayload) =>
        from(
          fetch(`http://${this.rasaServer.host || 'localhost'}:${this.rasaServer.port}/webhooks/rest/webhook`, {
            method: 'POST',
            body: JSON.stringify(payload),
          }),
        ),
      ),
      Ops.concatMap((response) => {
        return zip(from(response.json()), interval(this.configService.get('rasa.messageDelay')), (payload: RasaResponsePayload, _) => {
          return payload;
        });
      }),
    );
  }

  private async createRasaHelperServerContainer(helper: RasaHelperServer): Promise<Container> {
    return this.dockerService.instance.createContainer(helper.dockerOptions);
    // return this.dockerService.instance.createContainer({
    //   name: `rasa-action-${helper.name}`,
    //   Image: helper.dockerImage,
    //   Hostname: `rasa-action-${helper.name}`,
    //   Cmd: helper.command.split(' '),
    //   ExposedPorts: {
    //     [`5055/tcp`]: {},
    //   },
    //   HostConfig: {
    //     NetworkMode: 'chat-operator',
    //     PortBindings: {
    //       [`5055/tcp`]: [{ HostPort: `${helper.port}` }],
    //     },
    //   },
    // });
  }

  private async createRasaServerContainer(server: RasaServer): Promise<Container> {
    return this.dockerService.instance.createContainer(server.dockerOptions);
    // this.logger.debug('creating container');

    // return this.dockerService.instance.createContainer({
    //   name: `rasa-${rasaBot.name}`,
    //   Image: rasaBot.dockerImage,
    //   Hostname: `rasa-${rasaBot.name}`,
    //   Cmd: ['run', '-m', rasaBot.modelName, '--endpoints', 'endpoints.yml', '--remote-storage', 'aws', '--enable-api', '--debug'],
    //   Env: [
    //     'AWS_ACCESS_KEY_ID=minio',
    //     'AWS_SECRET_ACCESS_KEY=minio123',
    //     'AWS_DEFAULT_REGION=minio-default',
    //     'AWS_ENDPOINT_URL=http://minio:9000',
    //     'TRACKER_STORE_HOST=postgres',
    //     'TRACKER_STORE_PORT=5432',
    //     'TRACKER_STORE_DB=visa-bot',
    //     'TRACKER_STORE_USERNAME=chatop',
    //     'TRACKER_STORE_PASSWORD=chatOperator',
    //     'BUCKET_NAME=models',
    //     ...rasaBot.extraEnv,
    //   ],
    //   HostConfig: {
    //     NetworkMode: 'chat-operator',
    //     PortBindings: {
    //       [`5005/tcp`]: [{ HostPort: `${rasaBot.port}` }],
    //     },
    //   },
    // });
  }
}
