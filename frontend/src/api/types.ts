export type VotingStatus = 'DRAFT' | 'VIEWING' | 'VOTING' | 'FINISHED';

export const VOTING_STATUS_LABELS: Record<VotingStatus, string> = {
  DRAFT: 'Черновик',
  VIEWING: 'Просмотр',
  VOTING: 'Голосование',
  FINISHED: 'Завершено',
};

export interface VotingStateResponse {
  status: VotingStatus;
}

export interface PhotoListItem {
  id: number;
  name: string;
  createdAt: string;
  imageUrl: string;
}

export interface PhotosResponse {
  items: PhotoListItem[];
  total: number;
}

export interface Nomination {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
}

export interface NominationsResponse {
  items: Nomination[];
}

export interface ForbiddenBody {
  error: string;
  votingStatus?: VotingStatus;
}

export interface ResultPhoto {
  id: number;
  name: string;
  imageUrl: string;
}

export interface ResultItem {
  nomination: { id: number; name: string };
  top: ResultPhoto[];
}

export interface ResultsResponse {
  items: ResultItem[];
}

export interface MyVote {
  photoId: number;
  nominationId: number;
}

export interface MyVotesResponse {
  items: MyVote[];
}
