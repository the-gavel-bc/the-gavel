export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      article_body_images: {
        Row: {
          article_id: string;
          asset_id: string;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          asset_id: string;
        };
        Update: {
          article_id?: string;
          asset_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_body_images_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_body_images_asset_id_article_id_fkey";
            columns: ["asset_id", "article_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id", "article_id"];
          },
        ];
      };
      article_categories: {
        Row: {
          article_id: string;
          category_id: string;
          section_id: string;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          category_id: string;
          section_id: string;
        };
        Update: {
          article_id?: string;
          category_id?: string;
          section_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_categories_article_section_fkey";
            columns: ["article_id", "section_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id", "section_id"];
          },
          {
            foreignKeyName: "article_categories_category_section_fkey";
            columns: ["category_id", "section_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "section_id"];
          },
        ];
      };
      article_contributors: {
        Row: {
          article_id: string;
          contribution_role: Database["public"]["Enums"]["contribution_role"];
          display_order: number;
          profile_id: string;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          contribution_role: Database["public"]["Enums"]["contribution_role"];
          display_order?: number;
          profile_id: string;
        };
        Update: {
          article_id?: string;
          contribution_role?: Database["public"]["Enums"]["contribution_role"];
          display_order?: number;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_contributors_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_contributors_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      article_main_images: {
        Row: {
          alt_text: string;
          article_id: string;
          asset_id: string;
          credit: string;
        };
        ComputedFields: never;
        Insert: {
          alt_text: string;
          article_id: string;
          asset_id: string;
          credit: string;
        };
        Update: {
          alt_text?: string;
          article_id?: string;
          asset_id?: string;
          credit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_main_images_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: true;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_main_images_asset_id_article_id_fkey";
            columns: ["asset_id", "article_id"];
            isOneToOne: false;
            referencedRelation: "media_assets";
            referencedColumns: ["id", "article_id"];
          },
        ];
      };
      article_revisions: {
        Row: {
          actor_user_id: string;
          article_id: string;
          created_at: string;
          id: string;
          snapshot: NonNullable<Json>;
          snapshot_version: number;
        };
        ComputedFields: never;
        Insert: {
          actor_user_id: string;
          article_id: string;
          created_at?: string;
          id?: string;
          snapshot: NonNullable<Json>;
          snapshot_version?: number;
        };
        Update: {
          actor_user_id?: string;
          article_id?: string;
          created_at?: string;
          id?: string;
          snapshot?: NonNullable<Json>;
          snapshot_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "article_revisions_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      article_tags: {
        Row: {
          article_id: string;
          tag_id: string;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          tag_id: string;
        };
        Update: {
          article_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "article_tags_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "article_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      articles: {
        Row: {
          archived_at: string | null;
          content: Json | null;
          created_at: string;
          edit_version: number;
          excerpt: string | null;
          id: string;
          meta_description: string | null;
          owner_profile_id: string;
          published_at: string | null;
          section_id: string;
          seo_keyphrase: string | null;
          slug: string;
          status: Database["public"]["Enums"]["article_status"];
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          content?: Json | null;
          created_at?: string;
          edit_version?: number;
          excerpt?: string | null;
          id?: string;
          meta_description?: string | null;
          owner_profile_id: string;
          published_at?: string | null;
          section_id: string;
          seo_keyphrase?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["article_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          content?: Json | null;
          created_at?: string;
          edit_version?: number;
          excerpt?: string | null;
          id?: string;
          meta_description?: string | null;
          owner_profile_id?: string;
          published_at?: string | null;
          section_id?: string;
          seo_keyphrase?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["article_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "articles_owner_profile_id_fkey";
            columns: ["owner_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "articles_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_user_id: string;
          correlation_id: string | null;
          created_at: string;
          id: string;
          resource_id: string;
          resource_type: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_user_id: string;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          resource_id: string;
          resource_type: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          resource_id?: string;
          resource_type?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          active: boolean;
          created_at: string;
          edit_version: number;
          id: string;
          name: string;
          navigation_order: number;
          section_id: string;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          edit_version?: number;
          id?: string;
          name: string;
          navigation_order?: number;
          section_id: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          edit_version?: number;
          id?: string;
          name?: string;
          navigation_order?: number;
          section_id?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_section_id_fkey";
            columns: ["section_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
        ];
      };
      homepage_curation: {
        Row: {
          edit_version: number;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          edit_version?: number;
          id?: string;
          updated_at?: string;
        };
        Update: {
          edit_version?: number;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      homepage_selections: {
        Row: {
          article_id: string;
          group_name: string;
          position: number;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          group_name: string;
          position: number;
        };
        Update: {
          article_id?: string;
          group_name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "homepage_selections_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: true;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          article_id: string;
          byte_size: number | null;
          created_at: string;
          finalized_at: string | null;
          height: number | null;
          id: string;
          object_key: string;
          request_id: string;
          sha256: string | null;
          status: string;
          uploader_user_id: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          article_id: string;
          byte_size?: number | null;
          created_at?: string;
          finalized_at?: string | null;
          height?: number | null;
          id: string;
          object_key: string;
          request_id: string;
          sha256?: string | null;
          status?: string;
          uploader_user_id: string;
          width?: number | null;
        };
        Update: {
          article_id?: string;
          byte_size?: number | null;
          created_at?: string;
          finalized_at?: string | null;
          height?: number | null;
          id?: string;
          object_key?: string;
          request_id?: string;
          sha256?: string | null;
          status?: string;
          uploader_user_id?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "articles";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          active: boolean;
          approved_at: string | null;
          approved_by: string | null;
          edit_version: number;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          edit_version?: number;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          active?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          edit_version?: number;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          auth_user_id: string | null;
          biography: string | null;
          created_at: string;
          display_name: string;
          edit_version: number;
          id: string;
          slug: string;
          slug_frozen: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          auth_user_id?: string | null;
          biography?: string | null;
          created_at?: string;
          display_name: string;
          edit_version?: number;
          id?: string;
          slug: string;
          slug_frozen?: boolean;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          auth_user_id?: string | null;
          biography?: string | null;
          created_at?: string;
          display_name?: string;
          edit_version?: number;
          id?: string;
          slug?: string;
          slug_frozen?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      sections: {
        Row: {
          active: boolean;
          created_at: string;
          edit_version: number;
          id: string;
          name: string;
          navigation_order: number;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          edit_version?: number;
          id?: string;
          name: string;
          navigation_order?: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          edit_version?: number;
          id?: string;
          name?: string;
          navigation_order?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      site_information: {
        Row: {
          contact_email: string | null;
          edit_version: number;
          id: string;
          instagram_url: string | null;
          mission: string | null;
          submission_instructions: string | null;
        };
        ComputedFields: never;
        Insert: {
          contact_email?: string | null;
          edit_version?: number;
          id?: string;
          instagram_url?: string | null;
          mission?: string | null;
          submission_instructions?: string | null;
        };
        Update: {
          contact_email?: string | null;
          edit_version?: number;
          id?: string;
          instagram_url?: string | null;
          mission?: string | null;
          submission_instructions?: string | null;
        };
        Relationships: [];
      };
      tags: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      approve_membership: {
        Args: {
          p_display_name: string;
          p_expected_version?: number;
          p_request_id: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_target_user_id: string;
        };
        Returns: Json;
      };
      archive_article: {
        Args: {
          p_article_id: string;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      arm_media_cleanup_probe: {
        Args: { p_run_token: string };
        Returns: boolean;
      };
      begin_article_image_upload: {
        Args: { p_actor_user_id: string; p_asset_id: string };
        Returns: Json;
      };
      change_membership_role: {
        Args: {
          p_expected_version: number;
          p_request_id: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_target_user_id: string;
        };
        Returns: Json;
      };
      claim_media_cleanup: {
        Args: { p_limit: number };
        Returns: {
          claim_token: string;
          object_key: string;
        }[];
      };
      claim_retired_article_prefixes: {
        Args: { p_limit: number };
        Returns: {
          article_id: string;
          claim_token: string;
          scan_offset: number;
        }[];
      };
      complete_article_image_removal: {
        Args: { p_actor_user_id: string; p_asset_id: string };
        Returns: Json;
      };
      create_article_draft: {
        Args: { p_draft: Json; p_request_id: string };
        Returns: Json;
      };
      create_guest_contributor: {
        Args: {
          p_biography: string;
          p_display_name: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      current_profile: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_name: string;
          id: string;
        }[];
      };
      deactivate_contributor_profile: {
        Args: {
          p_expected_version: number;
          p_profile_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      deactivate_membership: {
        Args: {
          p_expected_version: number;
          p_request_id: string;
          p_target_user_id: string;
        };
        Returns: Json;
      };
      delete_archived_article: {
        Args: {
          p_article_id: string;
          p_confirm: boolean;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      finalize_article_image_upload: {
        Args: {
          p_actor_user_id: string;
          p_asset_id: string;
          p_byte_size: number;
          p_height: number;
          p_sha256: string;
          p_width: number;
        };
        Returns: Json;
      };
      finish_media_cleanup: {
        Args: {
          p_claim_token: string;
          p_object_key: string;
          p_success: boolean;
        };
        Returns: boolean;
      };
      finish_media_cleanup_run: {
        Args: { p_success: boolean; p_token: string };
        Returns: boolean;
      };
      finish_retired_article_scan: {
        Args: {
          p_article_id: string;
          p_claim_token: string;
          p_count: number;
          p_success: boolean;
        };
        Returns: boolean;
      };
      finish_retired_article_scan_v2: {
        Args: {
          p_article_id: string;
          p_claim_token: string;
          p_clean: boolean;
          p_count: number;
          p_page_read: boolean;
        };
        Returns: boolean;
      };
      get_admin_homepage_curation: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_media_cleanup_backlog: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_media_cleanup_probe: {
        Args: { p_run_token: string };
        Returns: {
          armed: boolean;
          object_key: string;
        }[];
      };
      get_media_cleanup_status: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_own_public_profile: {
        Args: Record<PropertyKey, never>;
        Returns: {
          biography: string;
          display_name: string;
          edit_version: number;
          slug: string;
          slug_frozen: boolean;
        }[];
      };
      get_public_article: { Args: { p_slug: string }; Returns: Json };
      get_public_article_media: {
        Args: { p_article_id: string; p_asset_id: string };
        Returns: Json;
      };
      get_public_homepage: { Args: Record<PropertyKey, never>; Returns: Json };
      get_public_site_navigation: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_site_information: {
        Args: Record<PropertyKey, never>;
        Returns: {
          contact_email: string;
          edit_version: number;
          instagram_url: string;
          mission: string;
          submission_instructions: string;
        }[];
      };
      list_admin_contributors: {
        Args: {
          p_before_id?: string;
          p_before_slug?: string;
          p_limit?: number;
          p_state?: string;
        };
        Returns: {
          active: boolean;
          biography: string;
          display_name: string;
          edit_version: number;
          linked_account: boolean;
          profile_id: string;
          referenced_live: boolean;
          slug: string;
          slug_frozen: boolean;
        }[];
      };
      list_admin_taxonomy: {
        Args: { p_after_id?: string; p_kind: string; p_limit?: number };
        Returns: {
          active: boolean;
          edit_version: number;
          id: string;
          name: string;
          navigation_order: number;
          parent_name: string;
          referenced_live: boolean;
          slug: string;
        }[];
      };
      list_article_audit_events: {
        Args: {
          p_action?: string;
          p_before_at?: string;
          p_before_id?: string;
          p_limit?: number;
        };
        Returns: {
          action: string;
          actor_label: string;
          article_exists: boolean;
          created_at: string;
          event_id: string;
          resource_id: string;
        }[];
      };
      list_membership_audit_events: {
        Args: { p_before_at?: string; p_before_id?: string; p_limit?: number };
        Returns: {
          action: string;
          actor_label: string;
          created_at: string;
          event_id: string;
          resource_id: string;
          target_email: string;
        }[];
      };
      list_membership_candidates: {
        Args: {
          p_before_email?: string;
          p_before_user_id?: string;
          p_limit?: number;
          p_state?: string;
        };
        Returns: {
          display_name: string;
          edit_version: number;
          eligible: boolean;
          email: string;
          role: Database["public"]["Enums"]["app_role"];
          state: string;
          user_id: string;
        }[];
      };
      list_public_articles: {
        Args: {
          p_cursor: Json;
          p_limit: number;
          p_primary: string;
          p_scope: string;
          p_secondary: string;
        };
        Returns: Json;
      };
      list_public_sitemap_archives: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      list_public_sitemap_articles: {
        Args: {
          p_after_id: string;
          p_after_published_at: string;
          p_limit: number;
        };
        Returns: Json;
      };
      mark_article_image_for_removal: {
        Args: { p_asset_id: string };
        Returns: Json;
      };
      publish_article: {
        Args: {
          p_article_id: string;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      record_media_cleanup_health: {
        Args: { p_success: boolean };
        Returns: boolean;
      };
      register_retired_media_key: {
        Args: {
          p_article_id: string;
          p_asset_id: string;
          p_claim_token: string;
        };
        Returns: boolean;
      };
      register_retired_media_keys: {
        Args: {
          p_article_id: string;
          p_asset_ids: string[];
          p_claim_token: string;
        };
        Returns: boolean;
      };
      request_article_image_upload: {
        Args: { p_article_id: string; p_request_id: string };
        Returns: Json;
      };
      restore_article: {
        Args: {
          p_article_id: string;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_article_draft: {
        Args: {
          p_article_id: string;
          p_draft: Json;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_contributor_profile: {
        Args: {
          p_biography: string;
          p_display_name: string;
          p_expected_version: number;
          p_profile_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_homepage_selections: {
        Args: {
          p_expected_version: number;
          p_featured: string[];
          p_lead: string;
          p_read_this: string[];
          p_request_id: string;
        };
        Returns: Json;
      };
      save_own_public_profile: {
        Args: {
          p_biography: string;
          p_display_name: string;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_published_article: {
        Args: {
          p_article_id: string;
          p_draft: Json;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_site_information: {
        Args: {
          p_contact_email: string;
          p_expected_version: number;
          p_instagram_url: string;
          p_mission: string;
          p_request_id: string;
          p_submission_instructions: string;
        };
        Returns: Json;
      };
      search_public_articles: {
        Args: { p_cursor?: Json; p_limit?: number; p_query: string };
        Returns: Json;
      };
      set_article_main_image: {
        Args: {
          p_alt_text: string;
          p_article_id: string;
          p_asset_id: string;
          p_credit: string;
          p_expected_version: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      start_media_cleanup_run: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      update_category_taxonomy: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_id: string;
          p_name: string;
          p_navigation_order: number;
          p_request_id: string;
        };
        Returns: Json;
      };
      update_section_taxonomy: {
        Args: {
          p_active: boolean;
          p_expected_version: number;
          p_id: string;
          p_name: string;
          p_navigation_order: number;
          p_request_id: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      app_role: "author" | "administrator";
      article_status: "draft" | "published" | "archived";
      contribution_role: "writer" | "editor" | "creative";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["author", "administrator"],
      article_status: ["draft", "published", "archived"],
      contribution_role: ["writer", "editor", "creative"],
    },
  },
} as const;
