import { createClient } from 'npm:@supabase/supabase-js@2.55.0';
import { generateVAPIDKeys, sendNotification } from 'npm:web-push-neo@0.1.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response