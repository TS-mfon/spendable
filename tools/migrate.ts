import {loadConfig} from '../src/config.ts';
import {createRepository} from '../src/storage/index.ts';
import {createSqlAuthStore} from '../src/auth/store.ts';
const config=loadConfig();
if(!config.databaseUrl)throw new Error('Configure DATABASE_URL before migration.');
const repository=await createRepository(config.databaseUrl);
try{const auth=await createSqlAuthStore(config.databaseUrl);await auth.close();}
finally{await repository.close();}
console.log('DATABASE_SCHEMA_VERIFIED');
