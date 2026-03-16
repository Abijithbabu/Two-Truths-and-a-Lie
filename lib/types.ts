export type GameStatus = "waiting" | "voting" | "revealed";
export type QuestionStatus = "pending" | "active" | "completed";

export interface Player {
  id: string;
  name: string;
  score: number;
  joined_at: string;
}

export interface Question {
  id: string;
  player_id: string;
  statement_1: string;
  statement_2: string;
  statement_3: string;
  lie_index: number; // 0, 1, or 2
  status: QuestionStatus;
  created_at: string;
  players?: Player;
}

export interface Vote {
  id: string;
  player_id: string;
  question_id: string;
  selected_index: number;
  created_at: string;
}

export interface GameState {
  id: number;
  current_question_id: string | null;
  status: GameStatus;
  shuffle_map?: number[] | null; // original->display mapping
}

export type Database = {
  public: {
    Tables: {
      players: {
        Row: Player;
        Insert: Omit<Player, "id" | "joined_at"> & {
          id?: string;
          joined_at?: string;
        };
        Update: Partial<Player>;
      };
      questions: {
        Row: Question;
        Insert: Omit<Question, "id" | "created_at" | "players"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<Question, "players">>;
      };
      votes: {
        Row: Vote;
        Insert: Omit<Vote, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Vote>;
      };
      game_state: {
        Row: GameState;
        Insert: GameState;
        Update: Partial<GameState>;
      };
    };
  };
};
