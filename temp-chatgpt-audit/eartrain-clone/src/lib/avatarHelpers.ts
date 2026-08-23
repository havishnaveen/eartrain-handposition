export const encodeAvatarAndTitle = (url: string | null | undefined, titleId: string | null | undefined, badges: string[] = []) => {
  const safeUrl = url || '';
  const safeTitle = titleId || '';
  const badgesStr = badges.join(',');
  if (!safeUrl && !safeTitle && badges.length === 0) return null;
  
  return `${safeUrl}#title:${safeTitle}#badges:${badgesStr}`;
}

export const decodeAvatarAndTitle = (rawUrl: string | null | undefined) => {
  if (!rawUrl) return { avatar_url: null, active_title: null, claimed_badges: [] };
  
  const badgesSplit = rawUrl.split('#badges:');
  const badgesStr = badgesSplit[1] || '';
  const claimed_badges = badgesStr ? badgesStr.split(',') : [];
  
  const titleSplit = badgesSplit[0].split('#title:');
  const avatarUrl = titleSplit[0] || null;
  const activeTitle = titleSplit[1] || null;
  
  return { avatar_url: avatarUrl, active_title: activeTitle, claimed_badges };
}
