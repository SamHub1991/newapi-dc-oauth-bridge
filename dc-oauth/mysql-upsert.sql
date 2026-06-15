INSERT INTO custom_oauth_providers (
  name,
  slug,
  icon,
  enabled,
  client_id,
  client_secret,
  authorization_endpoint,
  token_endpoint,
  user_info_endpoint,
  scopes,
  user_id_field,
  username_field,
  display_name_field,
  email_field,
  auth_style,
  created_at,
  updated_at
) VALUES (
  'dc.hhhl.cc',
  'dc-hhhl-cc',
  '',
  1,
  'placeholder',
  'placeholder',
  'https://api.example.com/dc-oauth/authorize',
  'https://api.example.com/dc-oauth/token',
  'https://api.example.com/dc-oauth/userinfo',
  'read:account',
  'id',
  'usernyame',
  'display_nyame',
  '',
  0,
  NOW(3),
  NOW(3)
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  enabled = VALUES(enabled),
  client_id = VALUES(client_id),
  client_secret = VALUES(client_secret),
  authorization_endpoint = VALUES(authorization_endpoint),
  token_endpoint = VALUES(token_endpoint),
  user_info_endpoint = VALUES(user_info_endpoint),
  scopes = VALUES(scopes),
  user_id_field = VALUES(user_id_field),
  username_field = VALUES(username_field),
  display_name_field = VALUES(display_name_field),
  email_field = VALUES(email_field),
  auth_style = VALUES(auth_style),
  updated_at = NOW(3);

INSERT INTO options (`key`, value)
VALUES ('ServerAddress', 'https://api.example.com')
ON DUPLICATE KEY UPDATE
  value = VALUES(value);
