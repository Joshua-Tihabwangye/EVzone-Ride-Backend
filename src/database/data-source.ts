import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { createTypeOrmOptions } from './typeorm-options';

export default new DataSource(createTypeOrmOptions() as DataSourceOptions);
